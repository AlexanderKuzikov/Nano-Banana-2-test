import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';
import { AppConfig, loadPrompt, ensureDir } from './config';
import { sanitizeModelName, timestamp, saveMetadata, getImageFiles } from './utils';
import { Session } from './session';

// Extract image data from chat response content.
// Providers may return: base64 data URL, plain base64, markdown image, or raw URL.
function extractImage(content: string): { type: 'b64' | 'url' | 'none'; data: string } {
  // data:image/...;base64,<data>
  const dataUrl = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
  if (dataUrl) return { type: 'b64', data: dataUrl[1] };

  // markdown ![...](url) or plain https URL ending with image ext
  const mdImg = content.match(/!\[.*?\]\((https?:\/\/[^)]+)\)/);
  if (mdImg) return { type: 'url', data: mdImg[1] };

  const plainUrl = content.match(/(https?:\/\/\S+\.(?:png|jpg|jpeg|webp))/i);
  if (plainUrl) return { type: 'url', data: plainUrl[1] };

  // bare base64 block (no prefix) — heuristic: long alphanum string
  const bare = content.trim();
  if (/^[A-Za-z0-9+/]{100,}={0,2}$/.test(bare)) return { type: 'b64', data: bare };

  return { type: 'none', data: content };
}

async function downloadUrl(url: string, dest: string): Promise<void> {
  const https = await import('https');
  const http = await import('http');
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https.default : http.default;
    const file = fs.createWriteStream(dest);
    proto.get(url, (res: import('http').IncomingMessage) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err: Error) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

export async function runChat(config: AppConfig, client: OpenAI, session: Session): Promise<void> {
  const prompt = loadPrompt(config);
  const outputDir = path.join(process.cwd(), config.outputDir);
  ensureDir(outputDir);

  const modelTag = sanitizeModelName(config.model);
  const isRetouch = config.mode === 'retouch';

  // Build list of jobs: retouch = one per input file, generate = single job
  const jobs: Array<{ inputFile?: string; messages: OpenAI.Chat.ChatCompletionMessageParam[] }> = [];

  if (isRetouch) {
    const inputDir = path.join(process.cwd(), config.inputDir);
    const imageFiles = getImageFiles(inputDir);
    if (imageFiles.length === 0) {
      console.warn(`[chat] No image files found in: ${inputDir}`);
      return;
    }
    console.log(`[chat/retouch] Found ${imageFiles.length} image(s)`);
    for (const imgPath of imageFiles) {
      const buf = fs.readFileSync(imgPath);
      const b64 = buf.toString('base64');
      const ext = path.extname(imgPath).replace('.', '') || 'jpeg';
      const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
      jobs.push({
        inputFile: imgPath,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${b64}` } },
              { type: 'text', text: prompt },
            ],
          },
        ],
      });
    }
  } else {
    jobs.push({
      messages: [{ role: 'user', content: prompt }],
    });
  }

  console.log(`[chat/${config.mode}] model: ${config.model}`);
  console.log(`[chat/${config.mode}] prompt: ${prompt.slice(0, 80)}...`);

  for (const job of jobs) {
    const inputName = job.inputFile ? path.basename(job.inputFile, path.extname(job.inputFile)) : 'gen';
    const ts = timestamp();
    const outPath = path.join(outputDir, `${modelTag}_${config.mode}_${inputName}_${ts}.png`);
    const startedAt = new Date().toISOString();
    const reqStart = Date.now();

    if (job.inputFile) console.log(`[chat/retouch] Processing: ${path.basename(job.inputFile)}`);

    let response: OpenAI.Chat.ChatCompletion;
    try {
      response = await client.chat.completions.create({
        model: config.model,
        messages: job.messages,
      });
    } catch (err: unknown) {
      const errorData = err instanceof Error ? { message: err.message, stack: err.stack } : err;
      const errPath = path.join(outputDir, `error_${config.mode}_${inputName}_${ts}.json`);
      fs.writeFileSync(errPath, JSON.stringify({ error: errorData, prompt, inputFile: job.inputFile }, null, 2));
      console.error(`[chat] Request failed. Error saved to: ${errPath}`);
      session.add({
        inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
        durationMs: Date.now() - reqStart,
        responseSource: 'error',
        error: (err as Error).message,
      });
      continue;
    }

    const usage = response.usage as unknown as Record<string, unknown> ?? null;
    const content = response.choices?.[0]?.message?.content ?? '';

    if (!content) {
      console.warn(`[chat] Empty content in response`);
      const rawPath = path.join(outputDir, `raw_response_${config.mode}_${inputName}_${ts}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(response, null, 2));
      console.warn('Raw response saved to:', rawPath);
      session.add({
        inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
        durationMs: Date.now() - reqStart,
        responseSource: 'none',
        usage,
      });
      continue;
    }

    const extracted = extractImage(content);

    if (extracted.type === 'none') {
      // No image found — save raw content for inspection
      console.warn(`[chat] No image data detected in response. Saving raw content.`);
      const rawPath = path.join(outputDir, `raw_content_${config.mode}_${inputName}_${ts}.txt`);
      fs.writeFileSync(rawPath, content, 'utf-8');
      const rawJsonPath = path.join(outputDir, `raw_response_${config.mode}_${inputName}_${ts}.json`);
      fs.writeFileSync(rawJsonPath, JSON.stringify(response, null, 2));
      console.warn('Raw content saved to:', rawPath);
      session.add({
        inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
        durationMs: Date.now() - reqStart,
        responseSource: 'none',
        usage,
      });
      continue;
    }

    try {
      if (extracted.type === 'b64') {
        fs.writeFileSync(outPath, Buffer.from(extracted.data, 'base64'));
      } else {
        await downloadUrl(extracted.data, outPath);
      }
    } catch (err: unknown) {
      console.error(`[chat] Failed to save image:`, (err as Error).message);
      session.add({
        inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
        durationMs: Date.now() - reqStart,
        responseSource: 'error',
        error: (err as Error).message,
        usage,
      });
      continue;
    }

    const source = extracted.type === 'b64' ? 'b64_json' : 'url';
    console.log(`[chat] Saved (${source}): ${outPath}`);
    session.add({
      inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
      outputFile: path.basename(outPath),
      durationMs: Date.now() - reqStart,
      responseSource: source,
      usage,
    });

    if (config.logging.saveMetadata) {
      saveMetadata(outPath, {
        mode: config.mode,
        apiStyle: 'chat',
        model: config.model,
        prompt,
        inputFile: job.inputFile ? path.basename(job.inputFile) : undefined,
        responseSource: source,
        usage,
        startedAt,
        savedAt: new Date().toISOString(),
        outputFile: path.basename(outPath),
      });
    }
  }
}

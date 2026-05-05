import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';
import { AppConfig, loadPrompt, ensureDir } from './config';
import { sanitizeModelName, timestamp, saveImageData, saveMetadata } from './utils';
import { Session } from './session';

export async function runGenerate(config: AppConfig, client: OpenAI, session: Session): Promise<void> {
  const prompt = loadPrompt(config);
  const outputDir = path.join(process.cwd(), config.outputDir);
  const logsDir = path.join(process.cwd(), config.logsDir);
  ensureDir(outputDir);
  ensureDir(logsDir);

  const { model, imageParams } = config;
  const params: OpenAI.Images.ImageGenerateParams = {
    model,
    prompt,
    n: imageParams.n ?? 1,
    ...(imageParams.size && { size: imageParams.size as OpenAI.Images.ImageGenerateParams['size'] }),
    ...(imageParams.quality && { quality: imageParams.quality as OpenAI.Images.ImageGenerateParams['quality'] }),
    response_format: 'b64_json',
  };

  console.log(`[generate] model: ${model}`);
  console.log(`[generate] prompt: ${prompt.slice(0, 80)}...`);
  console.log(`[generate] params:`, JSON.stringify({ size: params.size, n: params.n, quality: params.quality }));

  const startedAt = new Date().toISOString();
  const reqStart = Date.now();
  let response: OpenAI.Images.ImagesResponse;

  try {
    response = await client.images.generate(params);
  } catch (err: unknown) {
    const errorData = err instanceof Error ? { message: err.message, stack: err.stack } : err;
    const errPath = path.join(logsDir, `error_generate_${timestamp()}.json`);
    fs.writeFileSync(errPath, JSON.stringify({ error: errorData, params, prompt }, null, 2));
    console.error('[generate] Request failed. Error saved to:', errPath);
    session.add({ durationMs: Date.now() - reqStart, responseSource: 'error', error: (err as Error).message });
    throw err;
  }

  const modelTag = sanitizeModelName(model);
  const ts = timestamp();
  const usage = ((response as unknown) as Record<string, unknown>).usage as Record<string, unknown> ?? null;

  if (!response.data || response.data.length === 0) {
    const rawPath = path.join(logsDir, `raw_response_generate_${ts}.json`);
    fs.writeFileSync(rawPath, JSON.stringify(response, null, 2));
    console.warn('[generate] Response contained no images. Raw saved to:', rawPath);
    session.add({ durationMs: Date.now() - reqStart, responseSource: 'none', usage });
    return;
  }

  for (let i = 0; i < response.data.length; i++) {
    const img = response.data[i];
    const filePath = path.join(outputDir, `${modelTag}_gen_${ts}_${i + 1}.png`);
    const source = await saveImageData(img, filePath);

    if (source === 'none') {
      const rawPath = path.join(logsDir, `raw_img_${ts}_${i + 1}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(img, null, 2));
      console.warn(`[generate] Image ${i + 1}: no data. Raw item saved to:`, rawPath);
      session.add({ outputFile: path.basename(filePath), durationMs: Date.now() - reqStart, responseSource: 'none', usage });
      continue;
    }

    console.log(`[generate] Saved (${source}): ${filePath}`);
    session.add({ outputFile: path.basename(filePath), durationMs: Date.now() - reqStart, responseSource: source, usage });

    if (config.logging.saveMetadata) {
      saveMetadata(filePath, {
        mode: 'generate',
        model,
        prompt,
        params: { size: params.size, n: params.n, quality: params.quality },
        responseSource: source,
        usage,
        startedAt,
        savedAt: new Date().toISOString(),
        outputFile: path.basename(filePath),
      });
    }
  }
}

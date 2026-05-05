import * as path from 'path';
import OpenAI from 'openai';
import { AppConfig, loadPrompt, ensureDir } from './config';
import { sanitizeModelName, timestamp, saveImageData, saveMetadata } from './utils';

export async function runGenerate(config: AppConfig, client: OpenAI): Promise<void> {
  const prompt = loadPrompt(config);
  const outputDir = path.join(process.cwd(), config.outputDir);
  ensureDir(outputDir);

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
  let response: OpenAI.Images.ImagesResponse;

  try {
    response = await client.images.generate(params);
  } catch (err: unknown) {
    const errorData = err instanceof Error ? { message: err.message, stack: err.stack } : err;
    const errPath = path.join(outputDir, `error_generate_${timestamp()}.json`);
    const fs = await import('fs');
    fs.writeFileSync(errPath, JSON.stringify({ error: errorData, params, prompt }, null, 2));
    console.error('[generate] Request failed. Raw error saved to:', errPath);
    throw err;
  }

  const modelTag = sanitizeModelName(model);
  const ts = timestamp();

  if (!response.data || response.data.length === 0) {
    console.warn('[generate] Response contained no images. Raw response:');
    const fs = await import('fs');
    const rawPath = path.join(outputDir, `raw_response_generate_${ts}.json`);
    fs.writeFileSync(rawPath, JSON.stringify(response, null, 2));
    console.warn('Saved raw response to:', rawPath);
    return;
  }

  for (let i = 0; i < response.data.length; i++) {
    const img = response.data[i];
    const filePath = path.join(outputDir, `${modelTag}_gen_${ts}_${i + 1}.png`);
    const source = await saveImageData(img, filePath);

    if (source === 'none') {
      console.warn(`[generate] Image ${i + 1}: no b64_json or url in response item:`, JSON.stringify(img));
      const fs = await import('fs');
      const rawPath = path.join(outputDir, `raw_img_${ts}_${i + 1}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(img, null, 2));
      console.warn('Raw image item saved to:', rawPath);
      continue;
    }

    console.log(`[generate] Saved (${source}): ${filePath}`);

    if (config.logging.saveMetadata) {
      saveMetadata(filePath, {
        mode: 'generate',
        model,
        prompt,
        params: { size: params.size, n: params.n, quality: params.quality },
        responseSource: source,
        usage: (response as Record<string, unknown>).usage ?? null,
        startedAt,
        savedAt: new Date().toISOString(),
        outputFile: path.basename(filePath),
      });
    }
  }
}

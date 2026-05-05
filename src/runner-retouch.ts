import * as path from 'path';
import * as fs from 'fs';
import OpenAI from 'openai';
import { AppConfig, loadPrompt, ensureDir } from './config';
import { sanitizeModelName, timestamp, saveImageData, saveMetadata, getImageFiles } from './utils';
import { toFile } from 'openai';

export async function runRetouch(config: AppConfig, client: OpenAI): Promise<void> {
  const prompt = loadPrompt(config);
  const inputDir = path.join(process.cwd(), config.inputDir);
  const outputDir = path.join(process.cwd(), config.outputDir);
  ensureDir(outputDir);

  const imageFiles = getImageFiles(inputDir);
  if (imageFiles.length === 0) {
    console.warn(`[retouch] No image files found in: ${inputDir}`);
    return;
  }

  console.log(`[retouch] Found ${imageFiles.length} image(s) in ${inputDir}`);
  console.log(`[retouch] model: ${config.model}`);
  console.log(`[retouch] prompt: ${prompt.slice(0, 80)}...`);

  const modelTag = sanitizeModelName(config.model);

  for (const imagePath of imageFiles) {
    const originalName = path.basename(imagePath, path.extname(imagePath));
    const ts = timestamp();
    const outPath = path.join(outputDir, `${modelTag}_retouch_${originalName}_${ts}.png`);

    console.log(`[retouch] Processing: ${path.basename(imagePath)}`);

    const imageBuffer = fs.readFileSync(imagePath);
    const imageFile = await toFile(imageBuffer, path.basename(imagePath), { type: 'image/png' });

    const params: OpenAI.Images.ImageEditParams = {
      model: config.model,
      image: imageFile,
      prompt,
      n: config.imageParams.n ?? 1,
      ...(config.imageParams.size && {
        size: config.imageParams.size as OpenAI.Images.ImageEditParams['size'],
      }),
      response_format: 'b64_json',
    };

    const startedAt = new Date().toISOString();
    let response: OpenAI.Images.ImagesResponse;

    try {
      response = await client.images.edit(params);
    } catch (err: unknown) {
      const errorData = err instanceof Error ? { message: err.message, stack: err.stack } : err;
      const errPath = path.join(outputDir, `error_retouch_${originalName}_${ts}.json`);
      fs.writeFileSync(errPath, JSON.stringify({ error: errorData, inputFile: imagePath, prompt }, null, 2));
      console.error(`[retouch] Failed for ${path.basename(imagePath)}. Error saved to:`, errPath);
      continue;
    }

    if (!response.data || response.data.length === 0) {
      console.warn(`[retouch] Empty response for ${path.basename(imagePath)}`);
      const rawPath = path.join(outputDir, `raw_response_retouch_${originalName}_${ts}.json`);
      fs.writeFileSync(rawPath, JSON.stringify(response, null, 2));
      console.warn('Raw response saved to:', rawPath);
      continue;
    }

    for (let i = 0; i < response.data.length; i++) {
      const img = response.data[i];
      const filePath = i === 0 ? outPath : outPath.replace('.png', `_${i + 1}.png`);
      const source = await saveImageData(img, filePath);

      if (source === 'none') {
        console.warn(`[retouch] No image data in response item ${i + 1}:`, JSON.stringify(img));
        const rawPath = path.join(outputDir, `raw_img_retouch_${originalName}_${ts}_${i + 1}.json`);
        fs.writeFileSync(rawPath, JSON.stringify(img, null, 2));
        console.warn('Raw item saved to:', rawPath);
        continue;
      }

      console.log(`[retouch] Saved (${source}): ${filePath}`);

      if (config.logging.saveMetadata) {
        saveMetadata(filePath, {
          mode: 'retouch',
          provider: config.provider,
          model: config.model,
          prompt,
          params: { size: config.imageParams.size, n: config.imageParams.n },
          inputFile: path.basename(imagePath),
          responseSource: source,
          usage: (response as Record<string, unknown>).usage ?? null,
          startedAt,
          savedAt: new Date().toISOString(),
          outputFile: path.basename(filePath),
        });
      }
    }
  }
}

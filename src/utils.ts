import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import * as path from 'path';

// Sanitize model name for use in filenames
export function sanitizeModelName(model: string): string {
  return model.replace(/[^a-zA-Z0-9._-]/g, '-');
}

// Format current timestamp as YYYYMMDD-HHmmss
export function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

// Download a file from URL and save to disk
export function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (res) => {
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Save image from response item (b64_json preferred, url fallback)
export async function saveImageData(
  img: { b64_json?: string | null; url?: string | null },
  filePath: string
): Promise<'b64_json' | 'url' | 'none'> {
  if (img.b64_json) {
    const raw = Buffer.from(img.b64_json, 'base64');
    fs.writeFileSync(filePath, raw);
    return 'b64_json';
  } else if (img.url) {
    await downloadFile(img.url, filePath);
    return 'url';
  }
  return 'none';
}

// Save metadata JSON alongside image
export function saveMetadata(
  filePath: string,
  meta: Record<string, unknown>
): void {
  const metaPath = filePath.replace(/\.png$/, '.json');
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

// Get all image files from directory
export function getImageFiles(dir: string): string[] {
  const exts = ['.png', '.jpg', '.jpeg', '.webp'];
  return fs.readdirSync(dir)
    .filter(f => exts.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(dir, f));
}

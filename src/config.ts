import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ImageParams {
  size?: string;
  n?: number;
  quality?: string;
}

export interface LoggingConfig {
  saveMetadata: boolean;
}

export interface AppConfig {
  mode: 'generate' | 'retouch';
  apiStyle: 'images' | 'chat';
  model: string;
  baseURL: string;
  promptFile: string;
  inputDir: string;
  outputDir: string;
  imageParams: ImageParams;
  logging: LoggingConfig;
}

export function loadConfig(): AppConfig {
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found at ${configPath}`);
  }

  const config: AppConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  if (!['generate', 'retouch'].includes(config.mode)) {
    throw new Error(`Invalid mode: "${config.mode}". Must be "generate" or "retouch"`);
  }
  if (!['images', 'chat'].includes(config.apiStyle)) {
    throw new Error(`Invalid apiStyle: "${config.apiStyle}". Must be "images" or "chat"`);
  }
  if (!config.model) throw new Error('model is required in config.json');
  if (!config.baseURL) throw new Error('baseURL is required in config.json');
  if (!config.promptFile) throw new Error('promptFile is required in config.json');

  if (!process.env.API_KEY) {
    throw new Error('API_KEY env var is not set');
  }

  return config;
}

export function getApiKey(): string {
  return process.env.API_KEY as string;
}

export function loadPrompt(config: AppConfig): string {
  const promptPath = path.join(process.cwd(), config.promptFile);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt file not found: ${promptPath}`);
  }
  return fs.readFileSync(promptPath, 'utf-8').trim();
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

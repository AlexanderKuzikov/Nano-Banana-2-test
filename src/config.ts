import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

export interface ProviderConfig {
  baseURL: string;
  envKey: string;
}

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
  provider: string;
  model: string;
  promptFile: string;
  inputDir: string;
  outputDir: string;
  imageParams: ImageParams;
  providers: Record<string, ProviderConfig>;
  logging: LoggingConfig;
}

export function loadConfig(): AppConfig {
  const configPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`config.json not found at ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, 'utf-8');
  const config: AppConfig = JSON.parse(raw);

  const { mode, provider, model, promptFile, providers } = config;

  if (!['generate', 'retouch'].includes(mode)) {
    throw new Error(`Invalid mode: "${mode}". Must be "generate" or "retouch"`);
  }
  if (!providers[provider]) {
    throw new Error(`Provider "${provider}" not found in config.providers`);
  }
  if (!model) throw new Error('model is required in config.json');
  if (!promptFile) throw new Error('promptFile is required in config.json');

  const providerCfg = providers[provider];
  const apiKey = process.env[providerCfg.envKey];
  if (!apiKey) {
    throw new Error(`Env var "${providerCfg.envKey}" is not set (required for provider "${provider}")`);
  }

  return config;
}

export function getApiKey(config: AppConfig): string {
  const providerCfg = config.providers[config.provider];
  return process.env[providerCfg.envKey] as string;
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

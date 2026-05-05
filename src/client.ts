import OpenAI from 'openai';
import { AppConfig, getApiKey } from './config';

export function createClient(config: AppConfig): OpenAI {
  const providerCfg = config.providers[config.provider];
  const apiKey = getApiKey(config);

  return new OpenAI({
    apiKey,
    baseURL: providerCfg.baseURL,
  });
}

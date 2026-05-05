import OpenAI from 'openai';
import { AppConfig, getApiKey } from './config';

export function createClient(config: AppConfig): OpenAI {
  return new OpenAI({
    apiKey: getApiKey(),
    baseURL: config.baseURL,
  });
}

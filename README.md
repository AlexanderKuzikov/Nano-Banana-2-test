# Nano-Banana-2-test

Tester for image generation and retouching via OpenAI-compatible providers.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env — add your API key
```

## Usage

Edit `config.json` to switch mode, provider, model, prompt file, and image parameters.

**Generate mode:**
```json
{ "mode": "generate", "promptFile": "prompts/generate.txt" }
```

**Retouch mode:**
```json
{ "mode": "retouch", "promptFile": "prompts/retouch.txt" }
```
Place source images into the `input/` folder.

**Run:**
```bash
npm run dev
# or after build:
npm run build && npm start
```

## Output

All results go to `output/`. Each image gets a `{model}_{mode}_{name}_{timestamp}.png` filename.  
With `logging.saveMetadata: true`, a `.json` sidecar is saved alongside each image — contains full request params, response source (`b64_json` / `url`), usage/cost data if returned by the provider, and timestamps.

## Switching providers

Add a new entry to `config.providers` and set the matching env var in `.env`:

```json
"providers": {
  "vsellm": { "baseURL": "https://api.vsellm.ru/v1", "envKey": "VSELLM_API_KEY" },
  "openai":  { "baseURL": "https://api.openai.com/v1",  "envKey": "OPENAI_API_KEY" }
}
```
Then change `"provider": "openai"` in `config.json`.

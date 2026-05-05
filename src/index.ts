import { loadConfig } from './config';
import { createClient } from './client';
import { runGenerate } from './runner-generate';
import { runRetouch } from './runner-retouch';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[config error]', (err as Error).message);
    process.exit(1);
  }

  const client = createClient(config);

  console.log(`\n=== Nano-Banana-2-test ===`);
  console.log(`mode: ${config.mode} | model: ${config.model}\n`);

  try {
    if (config.mode === 'generate') {
      await runGenerate(config, client);
    } else if (config.mode === 'retouch') {
      await runRetouch(config, client);
    }
    console.log('\n[done]');
  } catch (err) {
    console.error('\n[fatal error]', (err as Error).message);
    process.exit(1);
  }
}

main();

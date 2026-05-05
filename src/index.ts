import { loadConfig } from './config';
import { createClient } from './client';
import { runGenerate } from './runner-generate';
import { runRetouch } from './runner-retouch';
import { runChat } from './runner-chat';
import { Session } from './session';
import { saveReport, printReport } from './report';
import * as path from 'path';
import { ensureDir } from './config';

async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error('[config error]', (err as Error).message);
    process.exit(1);
  }

  const client = createClient(config);
  const session = new Session();

  console.log(`\n=== Nano-Banana-2-test ===`);
  console.log(`mode: ${config.mode} | apiStyle: ${config.apiStyle} | model: ${config.model}\n`);

  const logsDir = path.join(process.cwd(), config.logsDir);
  ensureDir(logsDir);

  try {
    if (config.apiStyle === 'chat') {
      await runChat(config, client, session);
    } else if (config.mode === 'generate') {
      await runGenerate(config, client, session);
    } else if (config.mode === 'retouch') {
      await runRetouch(config, client, session);
    }
  } catch (err) {
    console.error('\n[fatal error]', (err as Error).message);
  }

  const report = session.build(config.mode, config.model);
  const reportPath = saveReport(report, logsDir);
  printReport(report);
  console.log(`report saved: ${reportPath}`);
}

main();

import * as fs from 'fs';
import * as path from 'path';
import { SessionReport } from './session';
import { timestamp } from './utils';

export function saveReport(report: SessionReport, logsDir: string): string {
  const filePath = path.join(logsDir, `session_report_${timestamp()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
  return filePath;
}

export function printReport(report: SessionReport): void {
  const dur = (report.durationMs / 1000).toFixed(1);
  const usageStr = Object.keys(report.totalUsage).length
    ? Object.entries(report.totalUsage).map(([k, v]) => `${k}: ${v}`).join(', ')
    : 'not provided by API';

  console.log('\n' + '='.repeat(48));
  console.log('SESSION REPORT');
  console.log('='.repeat(48));
  console.log(`mode          : ${report.mode}`);
  console.log(`model         : ${report.model}`);
  console.log(`duration      : ${dur}s`);
  console.log(`requests      : ${report.totalRequests} total | ${report.succeeded} ok | ${report.failed} failed`);
  console.log(`usage         : ${usageStr}`);
  if (report.failed > 0) {
    const errors = report.requests
      .filter(r => r.responseSource === 'error')
      .map(r => `  - ${r.inputFile ?? 'generate'}: ${r.error ?? 'unknown'}`)
      .join('\n');
    console.log(`errors:\n${errors}`);
  }
  console.log('='.repeat(48) + '\n');
}

import type { ScanSummary } from '../types';

export function printJsonReport(summary: ScanSummary) {
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

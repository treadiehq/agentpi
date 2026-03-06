import { resolve } from 'path';
import { discoverFiles } from './discoverFiles';
import { parseFile, resetProject } from './parseFile';
import { printTerminalReport } from './reporters/terminal';
import { printJsonReport } from './reporters/json';
import type { ScanSummary, RiskLevel } from './types';

export interface AuditOptions {
  path: string;
  json: boolean;
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const targetPath = resolve(opts.path);
  const cwd = process.cwd();

  resetProject();

  const files = await discoverFiles(targetPath);
  const allFindings = [];

  for (const file of files) {
    try {
      const findings = parseFile(file, cwd);
      allFindings.push(...findings);
    } catch {
      // Skip files that fail to parse (syntax errors, etc.)
    }
  }

  const counts: Record<RiskLevel, number> = {
    safe: 0,
    review: 0,
    needs_approval: 0,
    destructive: 0,
  };

  for (const f of allFindings) {
    counts[f.risk]++;
  }

  const summary: ScanSummary = {
    scannedFiles: files.length,
    findings: allFindings,
    counts,
  };

  if (opts.json) {
    printJsonReport(summary);
  } else {
    printTerminalReport(summary, opts.path);
  }
}

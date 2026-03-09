import type { ScanSummary, ToolFinding, RiskLevel } from '../types';

const RISK_LABEL: Record<RiskLevel, string> = {
  destructive: 'DESTRUCTIVE',
  needs_approval: 'NEEDS APPROVAL',
  review: 'REVIEW',
  safe: 'SAFE',
};

const RISK_ICON: Record<RiskLevel, string> = {
  destructive: '🔴',
  needs_approval: '🟠',
  review: '🟡',
  safe: '🟢',
};

const RISK_ORDER: RiskLevel[] = ['destructive', 'needs_approval', 'review', 'safe'];

function pad(str: string, len: number): string {
  return str + ' '.repeat(Math.max(0, len - str.length));
}

function printFinding(finding: ToolFinding, idx: number) {
  const icon = RISK_ICON[finding.risk];
  const label = pad(RISK_LABEL[finding.risk], 14);
  const loc = `${finding.filePath}:${finding.line}`;

  console.log(`  ${idx}. ${finding.functionName}()`);
  console.log(`     ${icon}  ${label}  ${loc}`);
  for (const reason of finding.reasons) {
    console.log(`     · ${reason}`);
  }
  for (const signal of finding.signals) {
    console.log(`     ℹ ${signal}`);
  }
  console.log('');
}

export function printTerminalReport(summary: ScanSummary, targetPath: string) {
  const { scannedFiles, findings, counts } = summary;

  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║              AgentPI — Audit Report                ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`\n  Path: ${targetPath}    Files scanned: ${scannedFiles}`);
  console.log('');

  if (findings.length === 0) {
    if (scannedFiles === 0) {
      console.log('  No .ts, .tsx, .js, .jsx, .mjs, or .cjs files found in that path.');
      console.log('  Check the path or add JavaScript/TypeScript source files.');
    } else {
      console.log('  No agent-callable functions detected.');
    }
    console.log('');
    console.log('  ────────────────────────────────────────────────────');
    console.log('  Gate risky tools with AgentPI scopes → https://github.com/treadiehq/agentpi');
    console.log('');
    return;
  }

  // Summary counts
  console.log(
    `  🔴 DESTRUCTIVE    ${String(counts.destructive).padStart(3)}` +
    `     🟠 NEEDS APPROVAL  ${String(counts.needs_approval).padStart(3)}`,
  );
  console.log(
    `  🟡 REVIEW         ${String(counts.review).padStart(3)}` +
    `     🟢 SAFE             ${String(counts.safe).padStart(3)}`,
  );
  console.log('');

  // Group by risk level, highest first
  let idx = 1;
  for (const risk of RISK_ORDER) {
    const group = findings.filter((f) => f.risk === risk);
    if (group.length === 0) continue;

    const heading =
      risk === 'destructive' ? 'High risk — Destructive' :
      risk === 'needs_approval' ? 'High risk — Needs Approval' :
      risk === 'review' ? 'Medium risk — Review' :
      'Low risk — Safe';

    console.log(`  ${heading}`);
    console.log('  ' + '─'.repeat(50));
    for (const finding of group) {
      printFinding(finding, idx++);
    }
  }

  console.log('  ────────────────────────────────────────────────────');
  console.log('  Gate risky tools with AgentPI scopes → https://github.com/treadiehq/agentpi');
  console.log('');
}

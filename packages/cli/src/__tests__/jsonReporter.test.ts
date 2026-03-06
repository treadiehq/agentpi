import { printJsonReport } from '../audit/reporters/json';
import type { ScanSummary } from '../audit/types';

function capturePrint(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  fn();
  process.stdout.write = orig;
  return chunks.join('');
}

describe('printJsonReport', () => {
  const summary: ScanSummary = {
    scannedFiles: 5,
    findings: [
      {
        filePath: 'src/users.ts',
        functionName: 'deleteUser',
        line: 10,
        exported: true,
        kind: 'function',
        risk: 'destructive',
        reasons: ['function name contains destructive keyword: delete'],
        signals: [],
      },
      {
        filePath: 'src/orders.ts',
        functionName: 'listOrders',
        line: 3,
        exported: true,
        kind: 'function',
        risk: 'safe',
        reasons: ['read-only naming pattern detected'],
        signals: [],
      },
    ],
    counts: { safe: 1, review: 0, needs_approval: 0, destructive: 1 },
  };

  it('outputs valid JSON', () => {
    const output = capturePrint(() => printJsonReport(summary));
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('serializes scannedFiles', () => {
    const output = capturePrint(() => printJsonReport(summary));
    const parsed = JSON.parse(output);
    expect(parsed.scannedFiles).toBe(5);
  });

  it('serializes findings array with correct shape', () => {
    const output = capturePrint(() => printJsonReport(summary));
    const parsed = JSON.parse(output) as ScanSummary;
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.findings[0].functionName).toBe('deleteUser');
    expect(parsed.findings[0].risk).toBe('destructive');
    expect(Array.isArray(parsed.findings[0].reasons)).toBe(true);
  });

  it('serializes counts with all four risk levels', () => {
    const output = capturePrint(() => printJsonReport(summary));
    const parsed = JSON.parse(output) as ScanSummary;
    expect(parsed.counts.safe).toBe(1);
    expect(parsed.counts.destructive).toBe(1);
    expect(parsed.counts.review).toBe(0);
    expect(parsed.counts.needs_approval).toBe(0);
  });

  it('outputs nothing extra beyond the JSON', () => {
    const output = capturePrint(() => printJsonReport(summary));
    const trimmed = output.trim();
    // Should start and end with JSON object braces
    expect(trimmed.startsWith('{')).toBe(true);
    expect(trimmed.endsWith('}')).toBe(true);
  });
});

import { parseFile, resetProject } from '../audit/parseFile';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP = join(tmpdir(), 'agentpi-audit-test-' + process.pid);

function writeFixture(filename: string, content: string): string {
  const filePath = join(TMP, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

beforeEach(() => {
  resetProject();
});

describe('parseFile — exported function declarations', () => {
  it('detects an exported async function', () => {
    const file = writeFixture('fn1.ts', `
export async function listOrders() {
  return db.orders.findMany();
}
`);
    const findings = parseFile(file, TMP);
    expect(findings).toHaveLength(1);
    expect(findings[0].functionName).toBe('listOrders');
    expect(findings[0].exported).toBe(true);
    expect(findings[0].kind).toBe('function');
    expect(findings[0].risk).toBe('safe');
  });

  it('detects multiple exported functions', () => {
    const file = writeFixture('fn2.ts', `
export function getUser(id: string) { return db.users.findOne(id); }
export async function deleteUser(id: string) { await db.users.delete({ where: { id } }); }
`);
    const findings = parseFile(file, TMP);
    expect(findings).toHaveLength(2);
    const names = findings.map((f) => f.functionName);
    expect(names).toContain('getUser');
    expect(names).toContain('deleteUser');
  });

  it('ignores non-exported functions in non-suspicious files', () => {
    const file = writeFixture('utils.ts', `
async function helperInternalThing() {}
function anotherInternal() {}
`);
    const findings = parseFile(file, TMP);
    expect(findings).toHaveLength(0);
  });
});

describe('parseFile — exported arrow functions', () => {
  it('detects an exported const arrow function', () => {
    const file = writeFixture('arrow1.ts', `
export const searchDocs = async () => {
  return searchIndex.query("abc");
};
`);
    const findings = parseFile(file, TMP);
    expect(findings).toHaveLength(1);
    expect(findings[0].functionName).toBe('searchDocs');
    expect(findings[0].kind).toBe('arrow_function');
    expect(findings[0].risk).toBe('safe');
  });

  it('detects risk in exported arrow function body', () => {
    const file = writeFixture('arrow2.ts', `
export const refundPayment = async (id: string) => {
  return stripe.refunds.create({ charge: id });
};
`);
    const findings = parseFile(file, TMP);
    expect(findings).toHaveLength(1);
    expect(findings[0].risk).toBe('needs_approval');
  });
});

describe('parseFile — risk classification end-to-end', () => {
  it('classifies updateCustomerEmail as review', () => {
    const file = writeFixture('update.ts', `
export async function updateCustomerEmail(id: string, email: string) {
  await db.customer.update({ where: { id }, data: { email } });
}
`);
    const findings = parseFile(file, TMP);
    expect(findings[0].risk).toBe('review');
  });

  it('classifies deleteUser as destructive', () => {
    const file = writeFixture('delete.ts', `
export async function deleteUser(id: string) {
  await db.user.delete({ where: { id } });
}
`);
    const findings = parseFile(file, TMP);
    expect(findings[0].risk).toBe('destructive');
  });
});

describe('parseFile — line numbers', () => {
  it('captures correct line number', () => {
    const file = writeFixture('lines.ts', `
// line 2 comment
// line 3 comment

export function getUser(id: string) {
  return db.users.findOne(id);
}
`);
    const findings = parseFile(file, TMP);
    expect(findings[0].line).toBe(5);
  });
});

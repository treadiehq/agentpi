import { classifyRisk } from '../audit/classifyRisk';

describe('classifyRisk — by function name', () => {
  it('classifies read-only names as safe', () => {
    for (const name of ['listOrders', 'getUser', 'fetchData', 'searchDocs', 'findById', 'queryItems']) {
      const { risk } = classifyRisk(name, '');
      expect(risk).toBe('safe');
    }
  });

  it('classifies write names as review', () => {
    for (const name of ['updateCustomerEmail', 'createUser', 'saveSettings', 'sendNotification']) {
      const { risk } = classifyRisk(name, '');
      expect(risk).toBe('review');
    }
  });

  it('classifies sensitive names as needs_approval', () => {
    for (const name of ['refundPayment', 'chargeCustomer', 'deployService', 'resetPassword', 'revokeAccess']) {
      const { risk } = classifyRisk(name, '');
      expect(risk).toBe('needs_approval');
    }
  });

  it('classifies destructive names as destructive', () => {
    for (const name of ['deleteUser', 'removeAccount', 'destroyWorkspace', 'purgeCache', 'dropTable']) {
      const { risk } = classifyRisk(name, '');
      expect(risk).toBe('destructive');
    }
  });

  it('includes a human-readable reason mentioning the matched keyword', () => {
    const { reasons } = classifyRisk('deleteUser', '');
    expect(reasons.some((r) => r.includes('delete'))).toBe(true);
  });

  it('includes read-only reason for safe names', () => {
    const { reasons } = classifyRisk('listOrders', '');
    expect(reasons.some((r) => r.includes('read-only'))).toBe(true);
  });
});

describe('classifyRisk — body signal escalation', () => {
  it('escalates to destructive when body contains db delete mutation', () => {
    const body = 'await db.user.delete({ where: { id } });';
    const { risk, reasons } = classifyRisk('removeRecord', body);
    expect(risk).toBe('destructive');
    expect(reasons.some((r) => r.includes('database delete'))).toBe(true);
  });

  it('escalates to needs_approval when body contains payment signal', () => {
    const body = 'return stripe.refunds.create({ charge: chargeId });';
    const { risk, reasons } = classifyRisk('processRefund', body);
    expect(risk).toBe('needs_approval');
    expect(reasons.some((r) => r.includes('payment'))).toBe(true);
  });

  it('escalates review name to destructive when body has file deletion', () => {
    const body = 'await fs.unlink(filePath);';
    const { risk, reasons } = classifyRisk('cleanupFiles', body);
    expect(risk).toBe('destructive');
    expect(reasons.some((r) => r.includes('file deletion'))).toBe(true);
  });

  it('escalates safe name to review when body has db write mutation', () => {
    const body = 'await db.orders.update({ where: { id }, data: { status } });';
    const { risk, reasons } = classifyRisk('getOrder', body);
    expect(risk).toBe('review');
    expect(reasons.some((r) => r.includes('database write'))).toBe(true);
  });

  it('escalates to needs_approval when body contains shell execution', () => {
    const body = 'execSync(`rm -rf ${path}`);';
    const { risk, reasons } = classifyRisk('cleanupDir', body);
    expect(risk).toBe('needs_approval');
    expect(reasons.some((r) => r.includes('shell execution'))).toBe(true);
  });

  it('notes guard signals without changing risk', () => {
    const body = 'if (!isAdmin) throw new Error(); await db.user.delete({ where: { id } });';
    const { risk, signals } = classifyRisk('deleteUser', body);
    expect(risk).toBe('destructive');
    expect(signals.some((s) => s.includes('admin guard'))).toBe(true);
  });
});

describe('classifyRisk — baseline sample cases', () => {
  it('listOrders with findMany → safe', () => {
    const { risk } = classifyRisk('listOrders', 'return db.orders.findMany();');
    expect(risk).toBe('safe');
  });

  it('updateCustomerEmail with db.update → review', () => {
    const { risk } = classifyRisk('updateCustomerEmail', 'await db.customer.update({ where: { id }, data: { email } });');
    expect(risk).toBe('review');
  });

  it('refundPayment with stripe → needs_approval', () => {
    const { risk } = classifyRisk('refundPayment', 'return stripe.refunds.create({ charge: id });');
    expect(risk).toBe('needs_approval');
  });

  it('deleteUser with db.delete → destructive', () => {
    const { risk } = classifyRisk('deleteUser', 'await db.user.delete({ where: { id } });');
    expect(risk).toBe('destructive');
  });

  it('searchDocs with query → safe', () => {
    const { risk } = classifyRisk('searchDocs', 'return searchIndex.query("abc");');
    expect(risk).toBe('safe');
  });
});

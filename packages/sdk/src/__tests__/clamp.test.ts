import { validateScopes, clampLimits } from '../clamp';

describe('validateScopes', () => {
  it('passes when all requested scopes are allowed', () => {
    expect(validateScopes(['read', 'deploy'], ['read', 'deploy', 'write'])).toEqual([
      'read',
      'deploy',
    ]);
  });

  it('throws when a requested scope is not allowed', () => {
    expect(() => validateScopes(['read', 'admin'], ['read', 'write'])).toThrow(
      'Requested scopes exceed tool maximum',
    );
  });

  it('includes rejected scopes in error detail', () => {
    try {
      validateScopes(['read', 'admin', 'sudo'], ['read', 'write']);
      fail('should have thrown');
    } catch (err: any) {
      expect(err.detail).toEqual({ rejected: ['admin', 'sudo'], allowed: ['read', 'write'] });
    }
  });

  it('handles empty requested', () => {
    expect(validateScopes([], ['read'])).toEqual([]);
  });
});

describe('clampLimits', () => {
  it('clamps each limit to max', () => {
    const result = clampLimits(
      { rpm: 200, dailyQuota: 5000, concurrency: 10 },
      { rpm: 120, dailyQuota: 1000, concurrency: 5 },
    );
    expect(result).toEqual({ rpm: 120, dailyQuota: 1000, concurrency: 5 });
  });

  it('preserves requested when under max', () => {
    const result = clampLimits(
      { rpm: 60, dailyQuota: 500, concurrency: 1 },
      { rpm: 120, dailyQuota: 1000, concurrency: 5 },
    );
    expect(result).toEqual({ rpm: 60, dailyQuota: 500, concurrency: 1 });
  });
});

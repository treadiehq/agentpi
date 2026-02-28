import { Limits, ScopesNotAllowedError } from '@agentpi/shared';

export function validateScopes(requested: string[], allowed: string[]): string[] {
  const set = new Set(allowed);
  const rejected = requested.filter((s) => !set.has(s));
  if (rejected.length > 0) {
    throw new ScopesNotAllowedError({
      rejected,
      allowed,
    });
  }
  return requested;
}

export function clampLimits(requested: Limits, max: Limits): Limits {
  return {
    rpm: Math.min(requested.rpm, max.rpm),
    dailyQuota: Math.min(requested.dailyQuota, max.dailyQuota),
    concurrency: Math.min(requested.concurrency, max.concurrency),
  };
}

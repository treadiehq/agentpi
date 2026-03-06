import type { RiskLevel, ToolFinding } from './types';
import {
  NAME_RULES,
  BODY_ESCALATION_SIGNALS,
  GUARD_SIGNALS,
} from './rules/keywords';

const RISK_ORDER: RiskLevel[] = ['safe', 'review', 'needs_approval', 'destructive'];

function higher(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

const RISK_LABEL: Record<RiskLevel, string> = {
  safe: 'read-only',
  review: 'write',
  needs_approval: 'sensitive',
  destructive: 'destructive',
};

export function classifyRisk(
  functionName: string,
  bodyText: string,
): Pick<ToolFinding, 'risk' | 'reasons' | 'signals'> {
  const reasons: string[] = [];
  const signals: string[] = [];

  // 1. Classify by function name — iterate risk groups highest to lowest
  let nameRisk: RiskLevel | null = null;
  let matchedKeyword: string | null = null;
  let matchedRisk: RiskLevel | null = null;

  outer: for (const group of NAME_RULES) {
    for (const rule of group) {
      if (rule.pattern.test(functionName)) {
        nameRisk = rule.risk;
        matchedKeyword = rule.keyword;
        matchedRisk = rule.risk;
        break outer;
      }
    }
  }

  if (nameRisk !== null && matchedKeyword !== null && matchedRisk !== null) {
    reasons.push(
      `function name contains ${RISK_LABEL[matchedRisk]} keyword: ${matchedKeyword}`,
    );
  } else {
    nameRisk = 'review';
    reasons.push('no recognized naming pattern — defaulting to review');
  }

  // 2. Check body escalation signals
  let bodyRisk: RiskLevel = nameRisk;
  for (const signal of BODY_ESCALATION_SIGNALS) {
    if (signal.pattern.test(bodyText)) {
      bodyRisk = higher(bodyRisk, signal.escalateTo);
      reasons.push(signal.reason);
    }
  }

  // 3. Check guard signals (informational only)
  for (const guard of GUARD_SIGNALS) {
    if (guard.pattern.test(bodyText)) {
      signals.push(guard.signal);
    }
  }

  const risk = higher(nameRisk, bodyRisk);

  return { risk, reasons, signals };
}

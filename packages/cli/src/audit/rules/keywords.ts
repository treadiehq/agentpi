import type { RiskLevel } from '../types';

/**
 * Ordered from highest to lowest priority.
 * First match wins when classifying by function name.
 */
/**
 * Patterns match camelCase, PascalCase, snake_case, and kebab-case names.
 * We use (?:^|[A-Z_-]) style anchors instead of \b to handle camelCase
 * where word boundaries don't exist between adjoining word segments.
 * Each pattern matches the keyword at the start of the name or after
 * a camelCase boundary (uppercase letter), underscore, or hyphen.
 */
function camel(word: string): RegExp {
  // Matches: starts with word, or preceded by uppercase (camelCase boundary),
  // underscore, or hyphen — case-insensitive on the keyword itself.
  return new RegExp(`(?:^|(?<=[A-Z_-]))${word}(?=[A-Z_-]|$)`, 'i');
}

export const NAME_RULES: Array<{ risk: RiskLevel; keyword: string; pattern: RegExp }[]> = [
  // destructive
  [
    { risk: 'destructive', keyword: 'delete', pattern: /(?:^|(?<=[A-Z_-]))delete(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'remove', pattern: /(?:^|(?<=[A-Z_-]))remove(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'destroy', pattern: /(?:^|(?<=[A-Z_-]))destroy(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'purge', pattern: /(?:^|(?<=[A-Z_-]))purge(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'wipe', pattern: /(?:^|(?<=[A-Z_-]))wipe(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'drop', pattern: /(?:^|(?<=[A-Z_-]))drop(?=[A-Z_-]|$)/i },
    { risk: 'destructive', keyword: 'terminate', pattern: /(?:^|(?<=[A-Z_-]))terminate(?=[A-Z_-]|$)/i },
  ],
  // needs_approval
  [
    { risk: 'needs_approval', keyword: 'refund', pattern: /(?:^|(?<=[A-Z_-]))refund(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'charge', pattern: /(?:^|(?<=[A-Z_-]))charge(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'payout', pattern: /(?:^|(?<=[A-Z_-]))payout(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'transfer', pattern: /(?:^|(?<=[A-Z_-]))transfer(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'publish', pattern: /(?:^|(?<=[A-Z_-]))publish(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'deploy', pattern: /(?:^|(?<=[A-Z_-]))deploy(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'approve', pattern: /(?:^|(?<=[A-Z_-]))approve(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'ban', pattern: /(?:^|(?<=[A-Z_-]))ban(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'suspend', pattern: /(?:^|(?<=[A-Z_-]))suspend(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'reset', pattern: /(?:^|(?<=[A-Z_-]))reset(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'revoke', pattern: /(?:^|(?<=[A-Z_-]))revoke(?=[A-Z_-]|$)/i },
    { risk: 'needs_approval', keyword: 'rotate', pattern: /(?:^|(?<=[A-Z_-]))rotate(?=[A-Z_-]|$)/i },
  ],
  // review
  [
    { risk: 'review', keyword: 'create', pattern: /(?:^|(?<=[A-Z_-]))create(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'update', pattern: /(?:^|(?<=[A-Z_-]))update(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'edit', pattern: /(?:^|(?<=[A-Z_-]))edit(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'send', pattern: /(?:^|(?<=[A-Z_-]))send(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'invite', pattern: /(?:^|(?<=[A-Z_-]))invite(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'sync', pattern: /(?:^|(?<=[A-Z_-]))sync(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'save', pattern: /(?:^|(?<=[A-Z_-]))save(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'write', pattern: /(?:^|(?<=[A-Z_-]))write(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'patch', pattern: /(?:^|(?<=[A-Z_-]))patch(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'insert', pattern: /(?:^|(?<=[A-Z_-]))insert(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'add', pattern: /(?:^|(?<=[A-Z_-]))add(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'upload', pattern: /(?:^|(?<=[A-Z_-]))upload(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'submit', pattern: /(?:^|(?<=[A-Z_-]))submit(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'set', pattern: /(?:^|(?<=[A-Z_-]))set(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'post', pattern: /(?:^|(?<=[A-Z_-]))post(?=[A-Z_-]|$)/i },
    { risk: 'review', keyword: 'connect', pattern: /(?:^|(?<=[A-Z_-]))connect(?=[A-Z_-]|$)/i },
  ],
  // safe
  [
    { risk: 'safe', keyword: 'get', pattern: /(?:^|(?<=[A-Z_-]))get(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'list', pattern: /(?:^|(?<=[A-Z_-]))list(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'fetch', pattern: /(?:^|(?<=[A-Z_-]))fetch(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'read', pattern: /(?:^|(?<=[A-Z_-]))read(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'search', pattern: /(?:^|(?<=[A-Z_-]))search(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'find', pattern: /(?:^|(?<=[A-Z_-]))find(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'query', pattern: /(?:^|(?<=[A-Z_-]))query(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'load', pattern: /(?:^|(?<=[A-Z_-]))load(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'lookup', pattern: /(?:^|(?<=[A-Z_-]))lookup(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'show', pattern: /(?:^|(?<=[A-Z_-]))show(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'count', pattern: /(?:^|(?<=[A-Z_-]))count(?=[A-Z_-]|$)/i },
    { risk: 'safe', keyword: 'view', pattern: /(?:^|(?<=[A-Z_-]))view(?=[A-Z_-]|$)/i },
  ],
];

/** Body signals that escalate risk. Each entry describes what was found. */
export const BODY_ESCALATION_SIGNALS: Array<{
  pattern: RegExp;
  reason: string;
  escalateTo: RiskLevel;
}> = [
  // Destructive DB mutations
  {
    pattern: /\.(delete|deleteMany|deleteOne|destroy|drop|truncate)\s*\(/i,
    reason: 'database delete mutation detected',
    escalateTo: 'destructive',
  },
  // Payment / financial
  {
    pattern: /stripe|braintree|paypal|refund|charge|payout|transfer/i,
    reason: 'payment/financial signal detected',
    escalateTo: 'needs_approval',
  },
  // Deployment / infrastructure
  {
    pattern: /\.deploy\s*\(|kubectl|helm|terraform|pulumi|serverless/i,
    reason: 'deployment/infrastructure signal detected',
    escalateTo: 'needs_approval',
  },
  // Secret rotation
  {
    pattern: /rotate.*secret|rotate.*key|regenerate.*token/i,
    reason: 'secret rotation signal detected',
    escalateTo: 'needs_approval',
  },
  // Email sends
  {
    pattern: /sendgrid|nodemailer|\.sendMail\s*\(|\.send\s*\(\s*\{.*subject/i,
    reason: 'email send signal detected',
    escalateTo: 'review',
  },
  // DB write mutations
  {
    pattern: /\.(create|createMany|update|updateMany|upsert|insert|save)\s*\(/i,
    reason: 'database write mutation detected',
    escalateTo: 'review',
  },
  // External HTTP mutations
  {
    pattern: /fetch\s*\([^)]*,\s*\{[^}]*(method\s*:\s*['"])(POST|PUT|PATCH|DELETE)/i,
    reason: 'outbound HTTP mutation detected',
    escalateTo: 'review',
  },
  // Shell execution
  {
    pattern: /exec\s*\(|spawn\s*\(|execSync\s*\(|child_process/i,
    reason: 'shell execution detected',
    escalateTo: 'needs_approval',
  },
  // File deletion
  {
    pattern: /fs\.(unlink|rmdir|rm)\s*\(|rimraf/i,
    reason: 'file deletion detected',
    escalateTo: 'destructive',
  },
];

/** Body signals that indicate an approval guard is in place (downgrade note). */
export const GUARD_SIGNALS: Array<{ pattern: RegExp; signal: string }> = [
  { pattern: /isAdmin|requireAdmin/i, signal: 'admin guard detected' },
  { pattern: /requireApproval|needsApproval/i, signal: 'approval guard detected' },
  { pattern: /checkPermission|hasPermission|authorize/i, signal: 'permission check detected' },
  { pattern: /confirm\s*\(/i, signal: 'confirmation step detected' },
  { pattern: /policy\.check|policyCheck/i, signal: 'policy check detected' },
];

/** File name patterns that suggest this file contains agent-callable tools. */
export const SUSPICIOUS_FILE_PATTERNS = [
  /tool/i,
  /action/i,
  /route/i,
  /handler/i,
  /controller/i,
  /mcp/i,
  /server/i,
  /api/i,
  /service/i,
  /command/i,
];

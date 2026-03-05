/* ─── Limits ─── */
export interface Limits {
  rpm: number;
  dailyQuota: number;
  concurrency: number;
}

/* ─── Workspace reference ─── */
export interface WorkspaceRef {
  name: string;
  external_id?: string;
}

/* ─── Connect Grant ─── */
export interface ConnectGrantRequest {
  tool_id: string;
  requested_scopes: string[];
  requested_limits: Limits;
  workspace: WorkspaceRef;
  nonce: string;
}

export interface ConnectGrantResponse {
  connect_grant: string;
  expires_in: number;
}

/* ─── JWT custom claim ─── */
export interface Claim {
  org_id: string;
  tool_id: string;
  mode: 'autonomous';
  requested_plan_id: string;
  scopes: string[];
  limits: Limits;
  workspace: WorkspaceRef;
  nonce: string;
}

/* ─── Credential types ─── */
export type CredentialType = 'http_signature';

export type ConnectCredentials = { type: 'http_signature'; key_id: string; algorithm: string };

/* ─── Discovery ─── */
export interface PlanInfo {
  plan_id: string;
  /** Omitted from public discovery to avoid exposing exact rate-limit caps. */
  max_limits: Limits | null;
  scopes_allowed: string[];
}

export interface DiscoveryDocument {
  agentpi_version: string;
  tool_id: string;
  tool_name: string;
  connect_endpoint: string;
  credential_types: CredentialType[];
  plans: PlanInfo[];
  default_plan_id: string;
  /** Omitted from public discovery to avoid exposing exact rate-limit caps. */
  default_limits: Limits | null;
  idempotency: { header: string; ttl_seconds: number };
}

/* ─── Connect response from tool ─── */
export interface ConnectResult {
  status: 'active' | 'pending';
  tool_workspace_id: string;
  tool_agent_id: string;
  credentials: ConnectCredentials;
  applied_plan_id: string;
  applied_scopes: string[];
  applied_limits: Limits;
}

/* ─── Provision context passed to tool callback ─── */
export interface ProvisionContext {
  orgId: string;
  agentId: string;
  requestedScopes: string[];
  requestedLimits: Limits;
  workspace: WorkspaceRef;
  grantJti: string;
  grantExp: number;
}

/* ─── Error body ─── */
export interface ErrorBody {
  error: {
    code: string;
    message: string;
    detail?: Record<string, unknown>;
  };
}

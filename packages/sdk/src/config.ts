import { Limits, ProvisionContext } from '@agentpi/shared';
import {
  IDEMPOTENCY_HEADER,
  IDEMPOTENCY_TTL_SECONDS,
} from '@agentpi/shared';

/* ─── Store interfaces (pluggable) ─── */

export interface JtiStore {
  has(jti: string): Promise<boolean>;
  add(jti: string, expiresAt: Date): Promise<void>;
}

export interface IdempotencyEntry {
  requestHash: string;
  responseJson: string;
  expiresAt: Date;
}

export interface IdempotencyStore {
  get(key: string, orgId: string, toolId: string): Promise<IdempotencyEntry | null>;
  set(key: string, orgId: string, toolId: string, entry: IdempotencyEntry): Promise<void>;
}

/* ─── Simplified provision return ─── */

export interface ProvisionResult {
  workspaceId: string;
  agentId: string;
  apiKey: string;
}

/* ─── User-facing config ─── */

export interface AgentPIConfig {
  tool?: string | { id: string; name?: string };
  scopes: string[];
  provision: (ctx: ProvisionContext) => Promise<ProvisionResult>;

  baseUrl?: string;
  planId?: string;
  limits?: Partial<Limits>;
  jwksUrl?: string;
  issuer?: string;
  jtiStore?: JtiStore;
  idempotencyStore?: IdempotencyStore;
}

/* ─── Resolved internal config (fully populated) ─── */

export interface ResolvedConfig {
  toolId: string;
  toolName: string;
  connectEndpoint: string;
  agentpiIssuer: string;
  jwksUrl: string;
  idempotencyHeader: string;
  idempotencyTtlSeconds: number;
  planId: string;
  maxScopes: string[];
  maxLimits: Limits;
  jtiStore: JtiStore;
  idempotencyStore: IdempotencyStore;
  provision: (ctx: ProvisionContext) => Promise<ProvisionResult>;
}

const DEFAULT_LIMITS: Limits = { rpm: 60, dailyQuota: 1000, concurrency: 5 };

function deriveName(id: string): string {
  return id
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveTool(tool?: string | { id: string; name?: string }): { id: string; name: string } {
  if (!tool) {
    const envId = process.env.TOOL_ID;
    if (!envId) throw new Error('AgentPI: tool id is required — pass tool or set TOOL_ID');
    return { id: envId, name: deriveName(envId) };
  }
  if (typeof tool === 'string') {
    return { id: tool, name: deriveName(tool) };
  }
  return { id: tool.id, name: tool.name || deriveName(tool.id) };
}

export function resolveConfig(config: AgentPIConfig): ResolvedConfig {
  const tool = resolveTool(config.tool);

  return {
    toolId: tool.id,
    toolName: tool.name,
    connectEndpoint: '/v1/agentpi/connect',
    agentpiIssuer: config.issuer || process.env.AGENTPI_ISSUER || 'https://agentpi.local',
    jwksUrl:
      config.jwksUrl ||
      process.env.AGENTPI_JWKS_URL ||
      'http://localhost:4010/.well-known/jwks.json',
    idempotencyHeader: IDEMPOTENCY_HEADER,
    idempotencyTtlSeconds: IDEMPOTENCY_TTL_SECONDS,
    planId: config.planId || 'free',
    maxScopes: config.scopes,
    maxLimits: { ...DEFAULT_LIMITS, ...config.limits },
    jtiStore: config.jtiStore || lazyMemoryJtiStore(),
    idempotencyStore: config.idempotencyStore || lazyMemoryIdempotencyStore(),
    provision: config.provision,
  };
}

function lazyMemoryJtiStore(): JtiStore {
  const { MemoryJtiStore } = require('./stores');
  return new MemoryJtiStore();
}

function lazyMemoryIdempotencyStore(): IdempotencyStore {
  const { MemoryIdempotencyStore } = require('./stores');
  return new MemoryIdempotencyStore();
}

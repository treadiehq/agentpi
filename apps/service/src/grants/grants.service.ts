import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { KeysService } from '../keys/keys.service';
import { v4 as uuid } from 'uuid';
import { timingSafeEqual } from 'crypto';
import vestauth from 'vestauth';
import {
  ConnectGrantRequest,
  ConnectGrantResponse,
  Claim,
  GRANT_TTL_SECONDS,
  Limits,
} from '@agentpi/shared';

interface AgentPolicy {
  scopes: string[];
  limits: Limits;
}

interface AgentCounters {
  minuteBucket: number;
  minuteCount: number;
  dayBucket: number;
  dayCount: number;
}

const DEFAULT_LIMITS: Limits = { rpm: 10, dailyQuota: 100, concurrency: 1 };
const DEFAULT_SCOPES = ['read'];

/** Safe parser: throws at startup if an env var holds a non-integer value. */
function parsePositiveInt(raw: string, name: string): number {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got: "${raw}"`);
  }
  return n;
}

@Injectable()
export class GrantsService implements OnModuleInit {
  private readonly logger = new Logger(GrantsService.name);
  private readonly issuer: string;
  private readonly toolId: string;
  private readonly adminKey: string;
  private readonly defaultScopes: string[];
  private readonly defaultLimits: Limits;
  private readonly blockedAgents: Set<string>;
  private readonly perToolPolicies: Record<string, AgentPolicy>;
  private readonly perAgentPolicies: Record<string, AgentPolicy>;
  private readonly supportedTools: Set<string>;
  private readonly counters = new Map<string, AgentCounters>();

  constructor(private readonly keys: KeysService) {
    this.issuer = process.env.AGENTPI_ISSUER || 'https://agentpi.local';
    this.toolId = process.env.TOOL_ID || 'tool_example';
    this.adminKey = process.env.AGENTPI_ADMIN_KEY || '';

    this.defaultScopes =
      process.env.AGENTPI_DEFAULT_SCOPES?.split(',').map((s) => s.trim()).filter(Boolean) ||
      DEFAULT_SCOPES;

    this.defaultLimits = {
      rpm: parsePositiveInt(
        process.env.AGENTPI_DEFAULT_RPM || String(DEFAULT_LIMITS.rpm),
        'AGENTPI_DEFAULT_RPM',
      ),
      dailyQuota: parsePositiveInt(
        process.env.AGENTPI_DEFAULT_DAILY_QUOTA || String(DEFAULT_LIMITS.dailyQuota),
        'AGENTPI_DEFAULT_DAILY_QUOTA',
      ),
      concurrency: parsePositiveInt(
        process.env.AGENTPI_DEFAULT_CONCURRENCY || String(DEFAULT_LIMITS.concurrency),
        'AGENTPI_DEFAULT_CONCURRENCY',
      ),
    };

    this.blockedAgents = new Set(
      (process.env.AGENTPI_BLOCKED_AGENTS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );

    this.perToolPolicies = this.parsePerToolPolicies();
    this.perAgentPolicies = this.parsePerAgentPolicies();
    this.supportedTools = new Set<string>([
      this.toolId,
      ...Object.keys(this.perToolPolicies),
    ]);
  }

  onModuleInit() {
    if (!this.adminKey) {
      this.logger.warn(
        'AGENTPI_ADMIN_KEY is not set — admin endpoints (block/unblock) are disabled.',
      );
    }
    if (!process.env.AGENTPI_ISSUER) {
      this.logger.warn(
        'AGENTPI_ISSUER is not set — defaulting to "https://agentpi.local". ' +
          'Set this to your public service URL in production.',
      );
    }
    // The block list and rate counters are stored in process memory.
    // In a multi-replica or auto-restarting deployment this means blocks and
    // counters will not be shared across instances and will reset on restart.
    // For production use, back these with a shared store (e.g. Redis or Postgres)
    // using the AGENTPI_BLOCKED_AGENTS env var as a baseline seed for the block list.
    this.logger.warn(
      'Agent block list and rate counters are in-process memory only. ' +
        'They will reset on restart and are not shared across replicas. ' +
        'For production deployments, migrate these to a shared persistent store.',
    );
  }

  private logEvent(event: string, detail: Record<string, unknown>) {
    console.log(
      JSON.stringify({
        event,
        ts: new Date().toISOString(),
        ...detail,
      }),
    );
  }

  private parsePerAgentPolicies(): Record<string, AgentPolicy> {
    const raw = process.env.AGENTPI_AGENT_POLICIES;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<AgentPolicy>>;
      const out: Record<string, AgentPolicy> = {};
      for (const [uid, policy] of Object.entries(parsed)) {
        out[uid] = {
          scopes:
            policy.scopes?.filter((s): s is string => typeof s === 'string' && s.length > 0) ||
            this.defaultScopes,
          limits: {
            rpm: policy.limits?.rpm ?? this.defaultLimits.rpm,
            dailyQuota: policy.limits?.dailyQuota ?? this.defaultLimits.dailyQuota,
            concurrency: policy.limits?.concurrency ?? this.defaultLimits.concurrency,
          },
        };
      }
      return out;
    } catch (error) {
      this.logEvent('agent_policy_parse_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private parsePerToolPolicies(): Record<string, AgentPolicy> {
    const raw = process.env.AGENTPI_TOOL_POLICIES;
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw) as Record<string, Partial<AgentPolicy>>;
      const out: Record<string, AgentPolicy> = {};
      for (const [toolId, policy] of Object.entries(parsed)) {
        out[toolId] = {
          scopes:
            policy.scopes?.filter((s): s is string => typeof s === 'string' && s.length > 0) ||
            this.defaultScopes,
          limits: {
            rpm: policy.limits?.rpm ?? this.defaultLimits.rpm,
            dailyQuota: policy.limits?.dailyQuota ?? this.defaultLimits.dailyQuota,
            concurrency: policy.limits?.concurrency ?? this.defaultLimits.concurrency,
          },
        };
      }
      return out;
    } catch (error) {
      this.logEvent('tool_policy_parse_error', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {};
    }
  }

  private resolvePolicy(agentUid: string, toolId: string): AgentPolicy {
    const toolPolicy = this.perToolPolicies[toolId];
    const agentPolicy = this.perAgentPolicies[agentUid];
    return agentPolicy || toolPolicy || {
      scopes: this.defaultScopes,
      limits: this.defaultLimits,
    };
  }

  private clampLimits(requested: Limits, max: Limits): Limits {
    return {
      rpm: Math.min(requested.rpm, max.rpm),
      dailyQuota: Math.min(requested.dailyQuota, max.dailyQuota),
      concurrency: Math.min(requested.concurrency, max.concurrency),
    };
  }

  private isValidLimits(limits: Limits): boolean {
    return (
      Number.isFinite(limits.rpm) &&
      Number.isFinite(limits.dailyQuota) &&
      Number.isFinite(limits.concurrency) &&
      limits.rpm > 0 &&
      limits.dailyQuota > 0 &&
      limits.concurrency > 0
    );
  }

  private enforceUsage(toolId: string, agentUid: string, max: Limits) {
    const counterKey = `${toolId}:${agentUid}`;
    const now = Date.now();
    const minuteBucket = Math.floor(now / 60_000);
    const dayBucket = Math.floor(now / 86_400_000);
    const current = this.counters.get(counterKey) || {
      minuteBucket,
      minuteCount: 0,
      dayBucket,
      dayCount: 0,
    };

    if (current.minuteBucket !== minuteBucket) {
      current.minuteBucket = minuteBucket;
      current.minuteCount = 0;
    }
    if (current.dayBucket !== dayBucket) {
      current.dayBucket = dayBucket;
      current.dayCount = 0;
    }

    if (current.minuteCount >= max.rpm) {
      this.logEvent('grant_rejected_rate_limit', { agent_uid: agentUid, rpm: max.rpm });
      throw new ForbiddenException('Rate limit exceeded for this agent');
    }
    if (current.dayCount >= max.dailyQuota) {
      this.logEvent('grant_rejected_daily_quota', {
        agent_uid: agentUid,
        daily_quota: max.dailyQuota,
      });
      throw new ForbiddenException('Daily quota exceeded for this agent');
    }

    current.minuteCount += 1;
    current.dayCount += 1;
    this.counters.set(counterKey, current);
  }

  isBlocked(agentUid: string): boolean {
    return this.blockedAgents.has(agentUid);
  }

  requireAdmin(adminKey: string | undefined) {
    if (!this.adminKey) {
      throw new ForbiddenException('Admin operations are disabled');
    }
    if (!adminKey) {
      throw new ForbiddenException('Invalid admin key');
    }
    // Use a timing-safe comparison to prevent character-by-character brute-forcing
    // via response-time side-channel attacks.
    const expected = Buffer.from(this.adminKey, 'utf8');
    const provided = Buffer.alloc(expected.length);
    Buffer.from(adminKey, 'utf8').copy(provided);
    if (!timingSafeEqual(provided, expected)) {
      throw new ForbiddenException('Invalid admin key');
    }
  }

  blockAgent(agentUid: string) {
    this.blockedAgents.add(agentUid);
    this.logEvent('agent_blocked', { agent_uid: agentUid });
  }

  unblockAgent(agentUid: string) {
    this.blockedAgents.delete(agentUid);
    this.logEvent('agent_unblocked', { agent_uid: agentUid });
  }

  async verifyAgentSignature(
    method: string,
    uri: string,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<string> {
    try {
      const result = await vestauth.provider.verify(method, uri, headers);
      if (!result?.uid) {
        throw new UnauthorizedException('Signature verified but agent uid is missing');
      }
      if (this.isBlocked(result.uid)) {
        this.logEvent('grant_rejected_blocked', { agent_uid: result.uid, uri, method });
        throw new ForbiddenException('Agent is blocked');
      }
      return result.uid;
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof UnauthorizedException) {
        throw error;
      }
      // Log internal details server-side; return a generic message to the client
      // to avoid leaking library internals or key metadata.
      this.logger.warn(
        `Signature verification failure: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Agent signature verification failed');
    }
  }

  async issueGrant(body: ConnectGrantRequest, agentUid: string): Promise<ConnectGrantResponse> {
    if (!this.supportedTools.has(body.tool_id)) {
      // Log the rejected tool_id but do not emit the supported tool registry to logs
      // accessible by less-trusted parties.
      this.logEvent('grant_rejected_tool', {
        agent_uid: agentUid,
        tool_id: body.tool_id,
      });
      throw new ForbiddenException('Unknown tool_id');
    }
    if (!Array.isArray(body.requested_scopes)) {
      throw new BadRequestException('requested_scopes is required and must be an array');
    }
    // Bound the scope array to prevent CPU/memory DoS via oversized inputs.
    const MAX_SCOPES = 50;
    const MAX_SCOPE_LENGTH = 64;
    const SCOPE_PATTERN = /^[a-z0-9_:.\-]{1,64}$/;
    if (body.requested_scopes.length > MAX_SCOPES) {
      throw new BadRequestException(`requested_scopes must contain at most ${MAX_SCOPES} entries`);
    }
    for (const scope of body.requested_scopes) {
      if (typeof scope !== 'string' || scope.length > MAX_SCOPE_LENGTH || !SCOPE_PATTERN.test(scope)) {
        throw new BadRequestException(
          'Each scope must be a lowercase alphanumeric identifier (a-z, 0-9, _, :, ., -) up to 64 characters',
        );
      }
    }
    if (!body.requested_limits || typeof body.requested_limits !== 'object') {
      throw new BadRequestException('requested_limits is required and must be an object');
    }
    if (!this.isValidLimits(body.requested_limits)) {
      throw new BadRequestException('requested_limits must contain positive numeric values');
    }
    if (!body.workspace || typeof body.workspace !== 'object') {
      throw new BadRequestException('workspace is required and must be an object');
    }
    // Enforce a reasonable length limit on workspace.name to prevent unbounded DB writes.
    if (
      typeof body.workspace.name !== 'string' ||
      body.workspace.name.length === 0 ||
      body.workspace.name.length > 255
    ) {
      throw new BadRequestException('workspace.name must be a non-empty string of at most 255 characters');
    }
    if (!body.nonce || typeof body.nonce !== 'string') {
      throw new BadRequestException('nonce is required and must be a string');
    }
    if (body.nonce.length > 128) {
      throw new BadRequestException('nonce must be at most 128 characters');
    }
    // The nonce is embedded verbatim in the JWT claim and is used by the tool API
    // to bind grant issuance to a specific request. It is NOT checked for server-side
    // uniqueness at the grant-issuance layer — replay protection at that boundary is
    // handled by the JTI store in the SDK. The nonce prevents a JWKS-level MITM from
    // reusing a grant across different connect requests.

    const policy = this.resolvePolicy(agentUid, body.tool_id);
    this.enforceUsage(body.tool_id, agentUid, policy.limits);

    const scopes = body.requested_scopes.filter((scope) => policy.scopes.includes(scope));
    if (scopes.length === 0) {
      this.logEvent('grant_rejected_scope', {
        agent_uid: agentUid,
        requested_scopes: body.requested_scopes,
        allowed_scopes: policy.scopes,
      });
      throw new ForbiddenException('Requested scopes are not allowed for this agent');
    }
    const limits = this.clampLimits(body.requested_limits, policy.limits);

    // Derive a stable org_id from the verified agent UID so that each agent
    // is scoped to its own organisational namespace in downstream systems.
    // Using the agent UID directly keeps this simple while avoiding a
    // hardcoded sentinel that would collapse all tenants into one namespace.
    const orgId = `org_${agentUid}`;

    const jti = uuid();
    const agentpi: Claim = {
      org_id: orgId,
      tool_id: body.tool_id,
      mode: 'autonomous',
      requested_plan_id: 'free',
      scopes,
      limits,
      workspace: body.workspace,
      nonce: body.nonce,
    };

    const token = await this.keys.signGrant(
      {
        iss: this.issuer,
        aud: body.tool_id,
        sub: agentUid,
        jti,
        agentpi,
      },
      GRANT_TTL_SECONDS,
    );

    this.logEvent('grant_issued', {
      agent_uid: agentUid,
      tool_id: body.tool_id,
      scopes,
      limits,
      jti,
    });

    return { connect_grant: token, expires_in: GRANT_TTL_SECONDS };
  }
}

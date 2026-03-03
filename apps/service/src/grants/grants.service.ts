import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { KeysService } from '../keys/keys.service';
import { v4 as uuid } from 'uuid';
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

@Injectable()
export class GrantsService {
  private readonly issuer = process.env.AGENTPI_ISSUER || 'https://agentpi.local';
  private readonly toolId = process.env.TOOL_ID || 'tool_example';
  private readonly adminKey = process.env.AGENTPI_ADMIN_KEY || '';
  private readonly defaultScopes = (
    process.env.AGENTPI_DEFAULT_SCOPES?.split(',').map((s) => s.trim()).filter(Boolean) ||
    DEFAULT_SCOPES
  );
  private readonly defaultLimits = {
    rpm: parseInt(process.env.AGENTPI_DEFAULT_RPM || String(DEFAULT_LIMITS.rpm), 10),
    dailyQuota: parseInt(
      process.env.AGENTPI_DEFAULT_DAILY_QUOTA || String(DEFAULT_LIMITS.dailyQuota),
      10,
    ),
    concurrency: parseInt(
      process.env.AGENTPI_DEFAULT_CONCURRENCY || String(DEFAULT_LIMITS.concurrency),
      10,
    ),
  };
  private readonly blockedAgents = new Set(
    (process.env.AGENTPI_BLOCKED_AGENTS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  private readonly perToolPolicies: Record<string, AgentPolicy> = this.parsePerToolPolicies();
  private readonly perAgentPolicies: Record<string, AgentPolicy> = this.parsePerAgentPolicies();
  private readonly supportedTools = new Set<string>([
    this.toolId,
    ...Object.keys(this.perToolPolicies),
  ]);
  private readonly counters = new Map<string, AgentCounters>();

  constructor(private readonly keys: KeysService) {}

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
    if (!adminKey || adminKey !== this.adminKey) {
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
      throw new UnauthorizedException(
        `Invalid agent signature: ${error instanceof Error ? error.message : 'verification failed'}`,
      );
    }
  }

  async issueGrant(body: ConnectGrantRequest, agentUid: string): Promise<ConnectGrantResponse> {
    if (!this.supportedTools.has(body.tool_id)) {
      this.logEvent('grant_rejected_tool', {
        agent_uid: agentUid,
        tool_id: body.tool_id,
        supported_tools: Array.from(this.supportedTools.values()),
      });
      throw new ForbiddenException(`Unknown tool_id: ${body.tool_id}`);
    }
    if (!Array.isArray(body.requested_scopes)) {
      throw new BadRequestException('requested_scopes is required and must be an array');
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
    if (!body.nonce || typeof body.nonce !== 'string') {
      throw new BadRequestException('nonce is required and must be a string');
    }

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

    const jti = uuid();
    const agentpi: Claim = {
      org_id: 'org_demo',
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

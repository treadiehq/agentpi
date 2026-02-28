import { createHash } from 'crypto';
import {
  InvalidGrantError,
  ReplayError,
  IdempotencyConflictError,
  HttpError,
  ConnectResult,
} from '@agentpi/shared';
import { ResolvedConfig } from './config';
import { verifyConnectGrant } from './verify';
import { validateScopes, clampLimits } from './clamp';

interface ConnectRequest {
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

interface ConnectResponse {
  status: (code: number) => ConnectResponse;
  send: (body: unknown) => void;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

function hashBody(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? {})).digest('hex');
}

export function createConnectHandler(config: ResolvedConfig) {
  return async (req: ConnectRequest, res: ConnectResponse) => {
    try {
      const authHeader = headerValue(req.headers, 'authorization');
      if (!authHeader?.startsWith('Bearer ')) {
        throw new InvalidGrantError('Missing Authorization Bearer token');
      }
      const token = authHeader.slice(7);

      const idempotencyKey = headerValue(req.headers, config.idempotencyHeader);
      if (!idempotencyKey) {
        throw new HttpError(
          400,
          'missing_idempotency_key',
          `Header ${config.idempotencyHeader} is required`,
        );
      }

      const grant = await verifyConnectGrant(
        token,
        config.jwksUrl,
        config.agentpiIssuer,
        config.toolId,
      );

      const claim = grant.agentpi;
      const requestHash = hashBody({
        orgId: claim.org_id,
        toolId: claim.tool_id,
        scopes: claim.scopes,
        limits: claim.limits,
        workspace: claim.workspace,
        nonce: claim.nonce,
      });

      const existing = await config.idempotencyStore.get(
        idempotencyKey,
        claim.org_id,
        config.toolId,
      );
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyConflictError();
        }
        res.status(200).send(JSON.parse(existing.responseJson));
        return;
      }

      try {
        await config.jtiStore.add(grant.jti, new Date(grant.exp * 1000));
      } catch {
        throw new ReplayError();
      }

      const appliedScopes = validateScopes(claim.scopes, config.maxScopes);
      const appliedLimits = clampLimits(claim.limits, config.maxLimits);

      const provisionResult = await config.provision({
        orgId: claim.org_id,
        agentId: grant.sub,
        requestedScopes: appliedScopes,
        requestedLimits: appliedLimits,
        workspace: claim.workspace,
        grantJti: grant.jti,
        grantExp: grant.exp,
      });

      const wireResult: ConnectResult = {
        status: 'active',
        tool_workspace_id: provisionResult.workspaceId,
        tool_agent_id: provisionResult.agentId,
        credentials: { type: 'api_key', api_key: provisionResult.apiKey },
        applied_plan_id: config.planId,
        applied_scopes: appliedScopes,
        applied_limits: appliedLimits,
      };

      const responseJson = JSON.stringify(wireResult);
      await config.idempotencyStore.set(
        idempotencyKey,
        claim.org_id,
        config.toolId,
        {
          requestHash,
          responseJson,
          expiresAt: new Date(Date.now() + config.idempotencyTtlSeconds * 1000),
        },
      );

      res.status(200).send(wireResult);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.statusCode).send(err.toJSON());
      } else {
        console.error('Connect handler error:', err);
        res.status(500).send({
          error: { code: 'internal_error', message: 'An unexpected error occurred' },
        });
      }
    }
  };
}

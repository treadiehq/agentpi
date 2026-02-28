import { DiscoveryDocument, AGENTPI_VERSION } from '@agentpi/shared';
import { ResolvedConfig } from './config';

export function createDiscoveryHandler(config: ResolvedConfig) {
  const doc: DiscoveryDocument = {
    agentpi_version: AGENTPI_VERSION,
    tool_id: config.toolId,
    tool_name: config.toolName,
    connect_endpoint: config.connectEndpoint,
    plans: [
      {
        plan_id: config.planId,
        max_limits: config.maxLimits,
        scopes_allowed: config.maxScopes,
      },
    ],
    default_plan_id: config.planId,
    default_limits: config.maxLimits,
    idempotency: {
      header: config.idempotencyHeader,
      ttl_seconds: config.idempotencyTtlSeconds,
    },
  };

  return (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send(doc);
  };
}

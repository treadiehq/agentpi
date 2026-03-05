import { DiscoveryDocument, AGENTPI_VERSION } from '@agentpi/shared';
import { ResolvedConfig } from './config';

export function createDiscoveryHandler(config: ResolvedConfig) {
  // Omit exact numeric rate-limit values from the public discovery document.
  // Exposing precise rpm/dailyQuota/concurrency caps gives attackers exact
  // knowledge for crafting traffic at the limit boundary. Agents learn their
  // actual applied limits from the connect response after authenticating.
  const doc: DiscoveryDocument = {
    agentpi_version: AGENTPI_VERSION,
    tool_id: config.toolId,
    tool_name: config.toolName,
    connect_endpoint: config.connectEndpoint,
    credential_types: config.credentialTypes,
    plans: [
      {
        plan_id: config.planId,
        max_limits: null,
        scopes_allowed: config.maxScopes,
      },
    ],
    default_plan_id: config.planId,
    default_limits: null,
    idempotency: {
      header: config.idempotencyHeader,
      ttl_seconds: config.idempotencyTtlSeconds,
    },
  };

  return (_req: unknown, res: { send: (body: unknown) => void }) => {
    res.send(doc);
  };
}

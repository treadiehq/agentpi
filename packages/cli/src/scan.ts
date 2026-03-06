/**
 * Cold capability probe — works against any API, no AgentPI required.
 *
 * Checks for common auth mechanisms and agent-readiness signals, then
 * reports which capabilities are present and which are missing.
 * Always ends with the AgentPI install suggestion when agent provisioning
 * is not detected, creating the wedge.
 */

interface Capability {
  label: string;
  supported: boolean;
  detail?: string;
}

const capabilities: Capability[] = [];

function found(label: string, detail?: string) {
  capabilities.push({ label, supported: true, detail });
}

function missing(label: string, detail?: string) {
  capabilities.push({ label, supported: false, detail });
}

async function probe(url: string, options?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(5000) });
  } catch {
    return null;
  }
}

async function checkOAuth(baseUrl: string): Promise<boolean> {
  // RFC 8414 / RFC 6749 — standard OAuth discovery endpoints
  const candidates = [
    `${baseUrl}/.well-known/oauth-authorization-server`,
    `${baseUrl}/.well-known/openid-configuration`,
    `${baseUrl}/oauth/token`,
    `${baseUrl}/oauth2/token`,
    `${baseUrl}/auth/token`,
    `${baseUrl}/connect/token`,
  ];

  for (const url of candidates) {
    const res = await probe(url);
    if (res && res.status !== 404) {
      return true;
    }
  }

  // Also check if a 401 from the root mentions OAuth/Bearer in WWW-Authenticate
  const root = await probe(baseUrl);
  if (root) {
    const wwwAuth = root.headers.get('www-authenticate') || '';
    if (/bearer|oauth/i.test(wwwAuth)) return true;
  }

  return false;
}

async function checkApiTokens(baseUrl: string): Promise<boolean> {
  // Common API token / API key patterns
  const candidates = [
    `${baseUrl}/api/tokens`,
    `${baseUrl}/api/keys`,
    `${baseUrl}/v1/tokens`,
    `${baseUrl}/v1/api-keys`,
    `${baseUrl}/user/tokens`,
    `${baseUrl}/account/api-keys`,
    `${baseUrl}/settings/tokens`,
  ];

  for (const url of candidates) {
    const res = await probe(url);
    // 401/403 means the endpoint exists but requires auth — good signal
    if (res && (res.status === 401 || res.status === 403 || res.status === 200)) {
      return true;
    }
  }

  // Check if a protected endpoint returns an API-key-style 401
  const root = await probe(baseUrl);
  if (root) {
    const wwwAuth = root.headers.get('www-authenticate') || '';
    if (/api.?key|token/i.test(wwwAuth)) return true;

    // Some APIs hint token auth in their 401 body
    if (root.status === 401) {
      try {
        const body = await root.clone().json() as Record<string, unknown>;
        const text = JSON.stringify(body).toLowerCase();
        if (text.includes('api_key') || text.includes('apikey') || text.includes('api-key')) {
          return true;
        }
      } catch {
        // not JSON, ignore
      }
    }
  }

  return false;
}

async function checkAgentProvisioning(baseUrl: string): Promise<boolean> {
  // AgentPI discovery doc
  const res = await probe(`${baseUrl}/.well-known/agentpi.json`);
  if (res && res.ok) {
    try {
      const body = await res.json() as Record<string, unknown>;
      if (body.connect_endpoint) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function checkScopedTokens(baseUrl: string): Promise<boolean> {
  // Look for scoped token / fine-grained permission signals in discovery docs
  const oauthDiscovery = await probe(`${baseUrl}/.well-known/oauth-authorization-server`);
  if (oauthDiscovery && oauthDiscovery.ok) {
    try {
      const body = await oauthDiscovery.json() as Record<string, unknown>;
      // RFC 8414 — scopes_supported indicates scope-aware tokens
      if (Array.isArray(body.scopes_supported) && (body.scopes_supported as unknown[]).length > 0) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  const oidc = await probe(`${baseUrl}/.well-known/openid-configuration`);
  if (oidc && oidc.ok) {
    try {
      const body = await oidc.json() as Record<string, unknown>;
      if (Array.isArray(body.scopes_supported) && (body.scopes_supported as unknown[]).length > 0) {
        return true;
      }
    } catch {
      // ignore
    }
  }

  // AgentPI provisioning itself implies scoped tokens
  const agentpi = await probe(`${baseUrl}/.well-known/agentpi.json`);
  if (agentpi && agentpi.ok) {
    try {
      const body = await agentpi.json() as Record<string, unknown>;
      const plans = body.plans as Array<Record<string, unknown>> | undefined;
      if (plans && plans[0]?.scopes_allowed) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

export async function scan(toolBaseUrl: string) {
  const baseUrl = toolBaseUrl.replace(/\/$/, '');

  console.log('');
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║         AgentPI — Agent Compatibility Scan         ║');
  console.log('╚════════════════════════════════════════════════════╝');
  console.log(`\n  Target: ${baseUrl}\n`);
  console.log('  Scanning...\n');

  const [hasOAuth, hasApiTokens, hasAgentProvisioning, hasScopedTokens] = await Promise.all([
    checkOAuth(baseUrl),
    checkApiTokens(baseUrl),
    checkAgentProvisioning(baseUrl),
    checkScopedTokens(baseUrl),
  ]);

  if (hasOAuth) found('OAuth supported');
  else missing('OAuth not detected');

  if (hasApiTokens) found('API tokens supported');
  else missing('API tokens not detected');

  if (hasAgentProvisioning) found('Agent provisioning supported');
  else missing('Agent provisioning missing');

  if (hasScopedTokens) found('Scoped tokens supported');
  else missing('Scoped tokens missing');

  // Print report
  console.log('  Agent compatibility report');
  console.log('');
  for (const cap of capabilities) {
    const icon = cap.supported ? '✓' : '✗';
    console.log(`  ${icon} ${cap.label}`);
  }

  console.log('');

  const agentReady = hasAgentProvisioning;

  if (agentReady) {
    console.log('  ✅  This API is agent-ready.');
    console.log('  Run `agentpi verify` for a full protocol conformance check.');
  } else {
    console.log('  Install AgentPI to enable agent onboarding:');
    console.log('');
    console.log('    npm install @agentpi/sdk');
    console.log('    https://github.com/treadiehq/agentpi');
  }

  console.log('');

  if (!agentReady) process.exit(1);
}

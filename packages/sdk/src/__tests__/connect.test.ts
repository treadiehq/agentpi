import * as jose from 'jose';
import { createServer } from 'http';
import type { Server } from 'http';
import { createConnectHandler } from '../connect';
import { MemoryJtiStore, MemoryIdempotencyStore } from '../stores';
import type { ResolvedConfig } from '../config';

let server: Server;
let jwksUrl: string;
let privateKey: jose.KeyLike;
const kid = 'test-kid';
const TOOL_ID = 'tool_test';
const ISSUER = 'https://agentpi.test';
const ORG_ID = 'org_test';
const AGENT_ID = 'agent_test';

function makeConfig(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    toolId: TOOL_ID,
    toolName: 'Test Tool',
    connectEndpoint: '/v1/agentpi/connect',
    credentialTypes: ['http_signature'],
    agentpiIssuer: ISSUER,
    jwksUrl,
    idempotencyHeader: 'idempotency-key',
    idempotencyTtlSeconds: 86400,
    planId: 'free',
    maxScopes: ['read', 'write', 'deploy'],
    maxLimits: { rpm: 120, dailyQuota: 1000, concurrency: 5 },
    jtiStore: new MemoryJtiStore(),
    idempotencyStore: new MemoryIdempotencyStore(),
    provision: async (ctx) => ({
      workspaceId: `ws_${ctx.orgId}`,
      agentId: `ag_${ctx.agentId}`,
      type: 'http_signature' as const,
      keyId: 'key_123',
      algorithm: 'ed25519',
    }),
    ...overrides,
  };
}

async function signGrant(claims: Record<string, unknown>, exp = '5m'): Promise<string> {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

function makeGrant(overrides: Record<string, unknown> = {}) {
  return {
    iss: ISSUER,
    aud: TOOL_ID,
    sub: AGENT_ID,
    jti: `jti_${Math.random().toString(36).slice(2)}`,
    agentpi: {
      org_id: ORG_ID,
      tool_id: TOOL_ID,
      mode: 'autonomous',
      scopes: ['read', 'deploy'],
      limits: { rpm: 60, dailyQuota: 500, concurrency: 1 },
      workspace: { name: 'Test Workspace' },
      nonce: 'nonce_1',
    },
    ...overrides,
  };
}

function mockRes() {
  const captured = { statusCode: 200, body: undefined as unknown };
  const adapter = {
    status(code: number) { captured.statusCode = code; return adapter; },
    send(body: unknown) { captured.body = body; },
  };
  return { res: captured, ...adapter };
}

function makeReq(token: string, idempotencyKey: string, body: unknown = {}) {
  return {
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': idempotencyKey,
    },
    body,
  };
}

beforeAll(async () => {
  const { publicKey, privateKey: pk } = await jose.generateKeyPair('RS256', { extractable: true });
  privateKey = pk;
  const pubJwk = await jose.exportJWK(publicKey);
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';

  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ keys: [pubJwk] }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        jwksUrl = `http://127.0.0.1:${addr.port}/jwks`;
      }
      resolve();
    });
  });
});

afterAll(() => server?.close());

describe('createConnectHandler — happy path', () => {
  it('returns 200 with a full ConnectResult on valid grant', async () => {
    const token = await signGrant(makeGrant());
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'idem_1'), adapter);

    expect(res.statusCode).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('active');
    expect(body.tool_workspace_id).toBe(`ws_${ORG_ID}`);
    expect(body.tool_agent_id).toBe(`ag_${AGENT_ID}`);
    expect((body.credentials as Record<string, unknown>).type).toBe('http_signature');
    expect((body.applied_scopes as string[])).toContain('read');
  });

  it('clamps limits to maxLimits', async () => {
    const token = await signGrant(makeGrant({
      agentpi: {
        org_id: ORG_ID,
        tool_id: TOOL_ID,
        mode: 'autonomous',
        scopes: ['read'],
        limits: { rpm: 9999, dailyQuota: 99999, concurrency: 99 },
        workspace: { name: 'WS' },
        nonce: 'n2',
      },
    }));
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'idem_clamp'), adapter);

    expect(res.statusCode).toBe(200);
    const applied = (res.body as Record<string, unknown>).applied_limits as Record<string, number>;
    expect(applied.rpm).toBe(120);
    expect(applied.dailyQuota).toBe(1000);
    expect(applied.concurrency).toBe(5);
  });
});

describe('createConnectHandler — authentication errors', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler({ headers: { 'idempotency-key': 'idem_x' }, body: {} }, adapter);

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when token is expired', async () => {
    const token = await signGrant(makeGrant(), '0s');
    await new Promise((r) => setTimeout(r, 1100));

    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'idem_exp'), adapter);

    expect(res.statusCode).toBe(401);
  }, 10_000);

  it('returns 401 when audience does not match toolId', async () => {
    const token = await signGrant(makeGrant({ aud: 'wrong_tool' }));
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'idem_aud'), adapter);

    expect(res.statusCode).toBe(401);
    const err = (res.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('invalid_grant');
  });
});

describe('createConnectHandler — idempotency header', () => {
  it('returns 400 when idempotency-key header is missing', async () => {
    const token = await signGrant(makeGrant());
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler({ headers: { authorization: `Bearer ${token}` }, body: {} }, adapter);

    expect(res.statusCode).toBe(400);
    const err = (res.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('missing_idempotency_key');
  });

  it('returns 400 when idempotency-key exceeds 255 characters', async () => {
    const token = await signGrant(makeGrant());
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'x'.repeat(256)), adapter);

    expect(res.statusCode).toBe(400);
    const err = (res.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('invalid_idempotency_key');
  });
});

describe('createConnectHandler — replay protection', () => {
  it('returns 401 replay_error when the same JTI is reused with a different idempotency key', async () => {
    const grant = makeGrant();
    const token = await signGrant(grant);
    const config = makeConfig();
    const handler = createConnectHandler(config);

    // First request succeeds
    const { res: res1, ...adapter1 } = mockRes();
    await handler(makeReq(token, 'idem_first'), adapter1);
    expect(res1.statusCode).toBe(200);

    // Same token, different idempotency key → replay error
    const { res: res2, ...adapter2 } = mockRes();
    await handler(makeReq(token, 'idem_second'), adapter2);
    expect(res2.statusCode).toBe(401);
    const err = (res2.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('invalid_grant');
    expect(String(err.message)).toMatch(/replay/i);
  });
});

describe('createConnectHandler — idempotent retry', () => {
  it('returns cached 200 on retry with same idempotency key and same body', async () => {
    const grant = makeGrant();
    const token1 = await signGrant(grant);
    const config = makeConfig();
    const handler = createConnectHandler(config);

    const { res: res1, ...adapter1 } = mockRes();
    await handler(makeReq(token1, 'idem_retry'), adapter1);
    expect(res1.statusCode).toBe(200);

    // New token (new JTI) but same idempotency key + same logical body
    const grant2 = { ...grant, jti: `jti_${Math.random().toString(36).slice(2)}` };
    const token2 = await signGrant(grant2);
    const { res: res2, ...adapter2 } = mockRes();
    await handler(makeReq(token2, 'idem_retry'), adapter2);
    expect(res2.statusCode).toBe(200);
    expect((res2.body as Record<string, unknown>).tool_workspace_id).toBe(
      (res1.body as Record<string, unknown>).tool_workspace_id,
    );
  });

  it('returns 409 when same idempotency key is used with different inputs', async () => {
    const config = makeConfig();
    const handler = createConnectHandler(config);

    // First request
    const g1 = makeGrant();
    const t1 = await signGrant(g1);
    const { res: res1, ...a1 } = mockRes();
    await handler(makeReq(t1, 'idem_conflict'), a1);
    expect(res1.statusCode).toBe(200);

    // Different workspace name → different request hash
    const g2 = makeGrant({
      agentpi: { ...makeGrant().agentpi, workspace: { name: 'Different Workspace' } },
    });
    const t2 = await signGrant(g2);
    const { res: res2, ...a2 } = mockRes();
    await handler(makeReq(t2, 'idem_conflict'), a2);
    expect(res2.statusCode).toBe(409);
    const err = (res2.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('idempotency_conflict');
  });
});

describe('createConnectHandler — scope validation', () => {
  it('returns 403 when requested scopes exceed allowed scopes', async () => {
    const grant = makeGrant({
      agentpi: {
        org_id: ORG_ID,
        tool_id: TOOL_ID,
        mode: 'autonomous',
        scopes: ['read', 'admin'],
        limits: { rpm: 60, dailyQuota: 500, concurrency: 1 },
        workspace: { name: 'WS' },
        nonce: 'n3',
      },
    });
    const token = await signGrant(grant);
    const { res, ...adapter } = mockRes();
    const handler = createConnectHandler(makeConfig());

    await handler(makeReq(token, 'idem_scope'), adapter);

    expect(res.statusCode).toBe(403);
    const err = (res.body as Record<string, unknown>).error as Record<string, unknown>;
    expect(err.code).toBe('scopes_not_allowed');
  });
});

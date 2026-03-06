import { agentpi } from '../middleware';

const PROVISION = async () => ({
  workspaceId: 'ws_1',
  agentId: 'ag_1',
  type: 'http_signature' as const,
  keyId: 'key_1',
  algorithm: 'ed25519',
});

function makeMiddleware(overrides = {}) {
  return agentpi({
    tool: 'test_tool',
    scopes: ['read', 'deploy'],
    provision: PROVISION,
    jwksUrl: 'http://localhost:9999/jwks',
    issuer: 'https://agentpi.test',
    ...overrides,
  });
}

function mockReqRes(method: string, url: string, extraHeaders: Record<string, string> = {}) {
  const req = { method, url, headers: { ...extraHeaders }, body: {} };
  const captured: { statusCode?: number; body?: unknown; headers: Record<string, string> } = {
    headers: {},
  };
  const res = {
    statusCode: undefined as number | undefined,
    status(code: number) { captured.statusCode = code; return res; },
    send(body: unknown) { captured.body = body; },
    json(body: unknown) { captured.body = body; },
    setHeader(name: string, value: string) { captured.headers[name] = value; },
    writeHead(code: number) { captured.statusCode = code; },
    end(body: string) { captured.body = body; },
    get statusCode_() { return captured.statusCode; },
  };
  return { req, res, captured };
}

describe('agentpi middleware — routing', () => {
  it('handles GET /.well-known/agentpi.json and returns discovery doc', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('GET', '/.well-known/agentpi.json');
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = captured.body as Record<string, unknown>;
    expect(body.tool_id).toBe('test_tool');
    expect(body.connect_endpoint).toBeDefined();
    expect(Array.isArray(body.plans)).toBe(true);
  });

  it('calls next() for unrelated routes', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('GET', '/api/users');
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(captured.body).toBeUndefined();
  });

  it('calls next() for POST to unrelated paths', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('POST', '/api/items');
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(captured.body).toBeUndefined();
  });

  it('handles POST to connect endpoint without calling next()', async () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('POST', '/v1/agentpi/connect');
    const next = jest.fn();

    middleware(req, res, next);

    // Connect handler is async but middleware doesn't await it — just ensure next wasn't called
    expect(next).not.toHaveBeenCalled();
  });

  it('strips query string before routing', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('GET', '/.well-known/agentpi.json?foo=bar');
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    const body = captured.body as Record<string, unknown>;
    expect(body.tool_id).toBe('test_tool');
  });
});

describe('agentpi middleware — discovery document shape', () => {
  it('includes required fields in discovery doc', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('GET', '/.well-known/agentpi.json');

    middleware(req, res, jest.fn());

    const body = captured.body as Record<string, unknown>;
    expect(body.tool_id).toBe('test_tool');
    expect(body.tool_name).toBeDefined();
    expect(body.agentpi_version).toBeDefined();
    expect(body.connect_endpoint).toBe('/v1/agentpi/connect');
    expect(body.idempotency).toBeDefined();
    expect((body.idempotency as Record<string, unknown>).header).toBeDefined();
  });

  it('reflects scopes in discovery plan', () => {
    const middleware = makeMiddleware();
    const { req, res, captured } = mockReqRes('GET', '/.well-known/agentpi.json');

    middleware(req, res, jest.fn());

    const body = captured.body as Record<string, unknown>;
    const plans = body.plans as Array<Record<string, unknown>>;
    expect(plans[0].scopes_allowed).toEqual(['read', 'deploy']);
  });
});

describe('agentpi middleware — 401 prompt injection', () => {
  it('injects agentpi hint into 401 responses when baseUrl is set', () => {
    const middleware = makeMiddleware({ baseUrl: 'https://my-tool.example.com' });
    const { req, res, captured } = mockReqRes('GET', '/api/protected');
    res.statusCode = 401;
    const next = jest.fn().mockImplementation(() => {
      res.send({ error: 'unauthorized' });
    });

    middleware(req, res, next);
    next();

    const body = captured.body as Record<string, unknown>;
    expect(body.agentpi).toBeDefined();
    expect((body.agentpi as Record<string, unknown>).discovery).toBeDefined();
  });

  it('does not inject agentpi hint into non-401 responses', () => {
    const middleware = makeMiddleware({ baseUrl: 'https://my-tool.example.com' });
    const { req, res, captured } = mockReqRes('GET', '/api/data');
    res.statusCode = 200;
    const next = jest.fn().mockImplementation(() => {
      res.send({ data: 'ok' });
    });

    middleware(req, res, next);
    next();

    const body = captured.body as Record<string, unknown>;
    expect(body.agentpi).toBeUndefined();
  });

  it('does not inject when baseUrl is not set', () => {
    const middleware = makeMiddleware(); // no baseUrl
    const { req, res, captured } = mockReqRes('GET', '/api/protected');
    res.statusCode = 401;
    const next = jest.fn().mockImplementation(() => {
      res.send({ error: 'unauthorized' });
    });

    middleware(req, res, next);
    next();

    const body = captured.body as Record<string, unknown>;
    expect(body.agentpi).toBeUndefined();
  });
});

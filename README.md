# AgentPI

**Let agents instantly and autonomously signup or login via API in minutes, no human signup required.**

AgentPI is "Continue with Google" for AI agents. An agent connects to any tool that implements the AgentPI protocol and either attaches to an existing workspace or creates a new free-tier workspace, then receives tool credentials.

Agent connects → workspace created → API call works. No signup form, no email verification, no human.

## 1. Install

```bash
npm install @agentpi/sdk
```

## 2. Add the middleware

If you use Prisma with the AgentPI schema (Workspace, ToolAgent, ToolApiKey models):

```typescript
import { agentpi, prismaProvision } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  provision: prismaProvision(prisma),
}));
```

Or write your own provision logic with any database:

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  provision: async (ctx) => {
    const ws = await db.upsertWorkspace(ctx.orgId);
    const agent = await db.upsertAgent(ws.id, ctx.agentId);
    const key = await db.issueApiKey(agent.id, ctx.requestedScopes);
    return { workspaceId: ws.id, agentId: agent.id, apiKey: key };
  },
}));
```

The SDK auto-mounts `GET /.well-known/agentpi.json` and `POST /v1/agentpi/connect`, handles JWT verification, replay protection, idempotency, scope validation, and limit clamping.

`tool` can be a string (name is derived automatically) or `{ id: 'my_tool', name: 'My Tool' }`. Falls back to `TOOL_ID` env if omitted.

## 3. Credential modes

AgentPI supports two credential modes. Tools can offer one or both.

### API key (default)

The tool issues a traditional API key on connect. The agent uses `Authorization: Bearer <api_key>` on subsequent requests.

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  provision: prismaProvision(prisma),
}));
```

### HTTP Signature (Vestauth / RFC 9421)

No shared secret. The tool registers the agent's key ID on connect. The agent signs every subsequent request with its private key per [RFC 9421](https://datatracker.ietf.org/doc/rfc9421/) / [Web-Bot-Auth](https://datatracker.ietf.org/doc/html/draft-meunier-web-bot-auth-architecture). Tools verify using the agent's public key.

```typescript
import { agentpi, prismaHttpSignatureProvision } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  credentialTypes: ['http_signature'],
  provision: prismaHttpSignatureProvision(prisma),
}));
```

The connect response returns `{ type: 'http_signature', key_id, algorithm }` instead of an API key. The agent then uses Vestauth (or any RFC 9421 signer) to authenticate subsequent requests.

### Both modes

Offer agents a choice by supporting both and letting your provision logic decide:

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  credentialTypes: ['api_key', 'http_signature'],
  provision: async (ctx) => {
    const ws = await db.upsertWorkspace(ctx.orgId);
    const agent = await db.upsertAgent(ws.id, ctx.agentId);

    if (agentPrefersSignatures(ctx)) {
      return { workspaceId: ws.id, agentId: agent.id, type: 'http_signature', keyId: agent.keyId };
    }
    const key = await db.issueApiKey(agent.id, ctx.requestedScopes);
    return { workspaceId: ws.id, agentId: agent.id, apiKey: key };
  },
}));
```

## What the SDK handles for you

- JWT signature verification via JWKS (cached, respects `kid`)
- Issuer / audience / expiry validation
- Replay protection (in-memory JTI store by default)
- Idempotency (same key + same inputs → cached response; different inputs → 409)
- Scope validation — rejects scopes your tool doesn't offer (403)
- Limit clamping against your tool's maximums
- Consistent error responses (401, 403, 409)

## Advanced: custom stores

The SDK ships with in-memory stores for JTI tracking and idempotency, which work for dev and single-process deployments. For multi-process or persistent setups, plug in your own:

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  jtiStore: new PrismaJtiStore(prisma),
  idempotencyStore: new PrismaIdempotencyStore(prisma),
  limits: { rpm: 120, dailyQuota: 5000 },
  provision: prismaProvision(prisma),
}));
```

See `apps/example-tool-api` for a full NestJS + Prisma example with custom stores.

### "Continue with AgentPI" prompt

When you set `baseUrl`, the middleware automatically injects a machine-readable prompt into every 401 response so agents can self-discover and connect:

```typescript
app.use(agentpi({
  tool: 'tool_acme',
  scopes: ['read', 'write'],
  baseUrl: 'https://api.example.com',  // enables auto-prompt on 401s
  provision: prismaProvision(prisma),
}));
```

Any 401 response now includes:

```json
{ "agentpi": { "prompt": "Continue with AgentPI", "discovery": "https://api.example.com/.well-known/agentpi.json" } }
```

The agent follows the `discovery` URL, connects, gets credentials, and retries, all automatic.

## How it works

**Single flow: CONNECT.** It acts as login if a mapping exists, signup if not.

1. **Discover** — `GET <tool>/.well-known/agentpi.json` to learn tool capabilities
2. **Grant** — `POST AgentPI /v1/connect-grants` to get a signed JWT (5 min TTL)
3. **Connect** — `POST <tool>/v1/agentpi/connect` with the grant JWT
4. **Receive credentials** — tool provisions a workspace + API key, returned once

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Agent    │────>│     Service      │     │    Your Tool     │
│             │     │                  │     │                  │
│  1. discover│     │ POST /v1/        │     │ GET /.well-known │
│  2. grant   │────>│  connect-grants  │     │  /agentpi.json   │
│  3. connect │     │                  │     │                  │
│             │     │ GET /.well-known │     │ POST /v1/agentpi │
│             │────>│  /jwks.json      │<────│  /connect        │
│             │     └──────────────────┘     │  (verify JWT)    │
│             │────────────────────────────> │                  │
│             │  Bearer <connect_grant>      │  → provision     │
│             │<────────────────────────────>│  → issue API key │
└─────────────┘     credentials returned     └──────────────────┘
```

## Security

| Protection          | Mechanism                                            |
|---------------------|------------------------------------------------------|
| Grant authenticity  | RS256 JWT signed by AgentPI, verified via JWKS       |
| Replay prevention   | JTI tracked; each grant usable exactly once          |
| Idempotency         | Idempotency-Key header; same inputs → cached result  |
| Scope enforcement   | SDK rejects scopes not offered by tool (403)         |
| Limit clamping      | SDK clamps limits to tool-defined maximum             |
| Key security (api_key) | Only hash stored; plaintext returned once         |
| No shared secret (http_signature) | Agent signs requests with private key; tool verifies with public key via RFC 9421 |

## Errors

| Status | Code                  | When                                     |
|--------|-----------------------|------------------------------------------|
| 401    | `invalid_grant`       | Bad/expired JWT, or replay detected      |
| 403    | `scopes_not_allowed`  | Requested scopes not offered by tool     |
| 409    | `idempotency_conflict`| Same key, different inputs               |

All errors return:
```json
{ "error": { "code": "...", "message": "...", "detail": {} } }
```

## Development

### Quick start

```bash
# Prerequisites: Node 20+, pnpm, Docker
pnpm install && pnpm dev
```

```bash
pnpm demo    # connect → provision → API call
pnpm verify  # 17-point conformance check
```

### Environment variables

See `.env.example` for all configuration:

| Variable               | Default                    | Description                          |
|------------------------|----------------------------|--------------------------------------|
| `AGENTPI_PORT`         | `4010`                     | AgentPI service port                 |
| `AGENTPI_ISSUER`       | `https://agentpi.local`    | JWT issuer claim                     |
| `AGENTPI_AGENT_API_KEY`| `agentpi_dev_key_12345`    | Agent credential for requesting grants|
| `TOOL_ID`              | `tool_example`             | Tool identifier (service + SDK)      |
| `TOOL_PORT`            | `4020`                     | Example tool port                    |
| `DATABASE_URL`         | `postgresql://...`         | Postgres connection string           |

## License

[FSL-1.1-MIT](LICENSE)

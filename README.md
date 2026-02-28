# AgentPI

**"Connect with AgentPI"** — autonomous signup and login via API in minutes. Like "Continue with Google" but for agents.

An agent connects to any tool that implements the AgentPI protocol and either attaches to an existing workspace or creates a new free-tier workspace, then receives tool credentials. No human approval required.

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Agent    │────>│     Service      │     │    Your Tool     │
│             │     │     :4010        │     │    :4020         │
│  1. discover│     │                  │     │                  │
│  2. grant   │────>│ POST /v1/        │     │ GET /.well-known │
│  3. connect │     │  connect-grants  │     │  /agentpi.json   │
│             │     │                  │     │                  │
│             │     │ GET /.well-known │     │ POST /v1/agentpi │
│             │────>│  /jwks.json      │<────│  /connect        │
│             │     └──────────────────┘     │  (verify JWT)    │
│             │────────────────────────────> │                  │
│             │  Bearer <connect_grant>      │  → provision     │
│             │<────────────────────────────>│  → issue API key │
└─────────────┘     credentials returned     └──────────────────┘
```

## Connect Flow

**Single flow: CONNECT.** It acts as login if a mapping exists, signup if not.

1. **Discover** — `GET <tool>/.well-known/agentpi.json` to learn tool capabilities
2. **Grant** — `POST AgentPI /v1/connect-grants` to get a signed JWT (5 min TTL)
3. **Connect** — `POST <tool>/v1/agentpi/connect` with the grant JWT
4. **Receive credentials** — tool provisions a workspace + API key, returned once

## Add Connect to Your Tool

### 1. Install

```bash
npm install @agentpi/sdk
```

### 2. Add the middleware

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

The SDK auto-mounts `GET /.well-known/agentpi.json` and `POST /v1/agentpi/connect`, handles JWT verification, replay protection, idempotency, scope intersection, and limit clamping.

`tool` can be a string (name is derived automatically) or `{ id: 'my_tool', name: 'My Tool' }`. Falls back to `TOOL_ID` env if omitted.

### What the SDK handles for you

- JWT signature verification via JWKS (cached, respects `kid`)
- Issuer / audience / expiry validation
- Replay protection (in-memory JTI store by default)
- Idempotency (same key + same inputs → cached response; different inputs → 409)
- Scope intersection and limit clamping against your tool's maximums
- Consistent error responses (401, 403, 409)

### Advanced: custom stores

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

## Security Model

| Protection          | Mechanism                                            |
|---------------------|------------------------------------------------------|
| Grant authenticity  | RS256 JWT signed by AgentPI, verified via JWKS       |
| Replay prevention   | JTI tracked; each grant usable exactly once          |
| Idempotency         | Idempotency-Key header; same inputs → cached result  |
| Scope enforcement   | SDK intersects requested scopes with tool maximum    |
| Limit clamping      | SDK clamps limits to tool-defined maximum             |
| Key security        | Tool API keys: only hash stored; plaintext returned once |

## Error Semantics

| Status | Code                  | When                                     |
|--------|-----------------------|------------------------------------------|
| 401    | `invalid_grant`       | Bad/expired JWT, or replay detected      |
| 403    | `scopes_not_allowed`  | Requested scopes not offered by tool     |
| 409    | `idempotency_conflict`| Same key, different inputs               |

All errors return:
```json
{ "error": { "code": "...", "message": "...", "detail": {} } }
```

## Quick Start (Dev)

```bash
# Prerequisites: Node 20+, pnpm, Docker
pnpm install && pnpm dev
```

This starts Postgres, the AgentPI service on `:4010`, and an example tool on `:4020`. Use the dev CLI to run the full flow:

```bash
pnpm demo    # connect → provision → API call
pnpm verify  # 17-point conformance check
```

## Running Tests

```bash
pnpm test
```

## Environment Variables

See `.env` for all configuration. Key variables:

| Variable               | Default                    | Description                          |
|------------------------|----------------------------|--------------------------------------|
| `AGENTPI_PORT`         | `4010`                     | AgentPI service port                 |
| `AGENTPI_ISSUER`       | `https://agentpi.local`    | JWT issuer claim                     |
| `AGENTPI_AGENT_API_KEY`| `agentpi_dev_key_12345`    | Agent credential for requesting grants|
| `TOOL_ID`              | `tool_example`             | Tool identifier (service + SDK)      |
| `TOOL_PORT`            | `4020`                     | Example tool port                    |
| `DATABASE_URL`         | `postgresql://...`         | Postgres connection string           |

# AgentPI SDK

SDK for adding "Connect with AgentPI" to your tool. Add autonomous agent signup and login to your API in minutes.

## Install

```bash
npm install @agentpi/sdk
```

## Quick start (with Prisma)

If you use Prisma with the AgentPI schema (Workspace, ToolAgent, ToolApiKey models):

```typescript
import { agentpi, prismaProvision } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  provision: prismaProvision(prisma),
}));
```

That's it. The middleware auto-mounts two routes:

- `GET /.well-known/agentpi.json` — discovery
- `POST /v1/agentpi/connect` — connect

## Custom provision logic

Use any database — just return `{ workspaceId, agentId, apiKey }`:

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

## What it handles

- JWT signature verification via JWKS (cached, respects `kid`)
- Issuer / audience / expiry validation
- Replay protection (in-memory JTI store by default)
- Idempotency (same key + same inputs → cached response; different inputs → 409)
- Scope intersection and limit clamping against your tool's maximums
- Consistent error responses (401, 403, 409)

## Config

| Field | Required | Default |
|---|---|---|
| `tool` | no | `TOOL_ID` env |
| `scopes` | yes | — |
| `provision` | yes | — |
| `baseUrl` | no | — (enables auto 401 prompt) |
| `planId` | no | `'free'` |
| `limits` | no | `{ rpm: 60, dailyQuota: 1000, concurrency: 5 }` |
| `jwksUrl` | no | `AGENTPI_JWKS_URL` env or `http://localhost:4010/.well-known/jwks.json` |
| `issuer` | no | `AGENTPI_ISSUER` env or `https://agentpi.local` |
| `jtiStore` | no | In-memory store |
| `idempotencyStore` | no | In-memory store |

`tool` accepts a string (`'my_tool'`), an object (`{ id: 'my_tool', name: 'My Tool' }`), or falls back to `TOOL_ID` env. When passed as a string, the display name is derived automatically (e.g. `'my_tool'` → `'My Tool'`).

## Minimal config with env

With `TOOL_ID` set in env, the config reduces to:

```typescript
app.use(agentpi({
  scopes: ['read', 'write', 'deploy'],
  provision: prismaProvision(prisma),
}));
```

## Provision callback

The `provision` function receives a `ProvisionContext`:

```typescript
interface ProvisionContext {
  orgId: string;
  agentId: string;
  requestedScopes: string[];   // already intersected with your maxScopes
  requestedLimits: Limits;     // already clamped to your maxLimits
  workspace: { name: string; external_id?: string };
  grantJti: string;
  grantExp: number;
}
```

Return a `ProvisionResult`:

```typescript
interface ProvisionResult {
  workspaceId: string;
  agentId: string;
  apiKey: string;
}
```

The SDK wraps this into the full wire format automatically.

## Custom stores

The built-in in-memory stores work for dev and single-process deployments. For multi-process or persistent setups, implement `JtiStore` and `IdempotencyStore`:

```typescript
import { agentpi, JtiStore, IdempotencyStore } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  jtiStore: new MyPrismaJtiStore(prisma),
  idempotencyStore: new MyPrismaIdempotencyStore(prisma),
  provision: prismaProvision(prisma),
}));
```

## "Continue with AgentPI" prompt

Set `baseUrl` and the middleware auto-injects a prompt into every 401 response:

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  baseUrl: 'https://api.example.com',
  provision: prismaProvision(prisma),
}));
```

Any 401 now includes `{ "agentpi": { "prompt": "Continue with AgentPI", "discovery": "..." } }`. Agents follow the discovery URL, connect, and retry automatically.

For frameworks where the middleware can't intercept responses (e.g. NestJS), use `createPrompt` manually:

```typescript
import { createPrompt } from '@agentpi/sdk';
const prompt = createPrompt('https://api.example.com');
// add `agentpi: prompt` to your 401 response bodies
```

## Advanced: manual route mounting

If the middleware doesn't fit your framework, use the lower-level handlers:

```typescript
import { resolveConfig, createDiscoveryHandler, createConnectHandler } from '@agentpi/sdk';

const config = resolveConfig({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  provision: async (ctx) => { /* ... */ },
});

app.get('/.well-known/agentpi.json', createDiscoveryHandler(config));
app.post('/v1/agentpi/connect', createConnectHandler(config));
```

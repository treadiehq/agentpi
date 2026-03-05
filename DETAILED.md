# AgentPI — Detailed Reference

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    Agent    │     │  AgentPI Service │     │    Your Tool     │
│             │     │  (port 4010)     │     │  (your API)      │
│  1. discover│────>│                  │     │ GET /.well-known │
│             │     │                  │     │  /agentpi.json   │
│  2. grant   │────>│ POST /v1/        │     │                  │
│             │     │  connect-grants  │     │                  │
│             │     │  (Vestauth auth) │     │                  │
│  3. connect │────────────────────────────> │ POST /v1/agentpi │
│             │     │ GET /.well-known │<────│  /connect        │
│             │     │  /jwks.json      │     │  (verify JWT)    │
│             │     └──────────────────┘     │  → provision     │
│             │<────────────────────────────>│  → credentials   │
└─────────────┘                             └──────────────────┘
```

**AgentPI Service** — issues signed JWTs (connect grants) after verifying agent identity via Vestauth HTTP signatures.

**SDK** — middleware you add to your tool. Handles the connect endpoint, JWT verification, and provisioning callback.

---

## SDK options

```typescript
app.use(agentpi({
  // Required
  tool: 'my_tool',                        // string or { id, name }; falls back to TOOL_ID env
  scopes: ['read', 'write', 'deploy'],    // scopes your tool offers
  provision: async (ctx) => { ... },      // called once per new agent/workspace

  // Optional
  limits: { rpm: 120, dailyQuota: 5000, concurrency: 5 },  // max limits you'll grant
  planId: 'free',
  baseUrl: 'https://api.example.com',     // enables "Continue with AgentPI" prompt on 401s
  jwksUrl: process.env.AGENTPI_JWKS_URL,  // override JWKS endpoint
  issuer: process.env.AGENTPI_ISSUER,     // override expected JWT issuer
  jtiStore: new PrismaJtiStore(prisma),   // custom replay-protection store
  idempotencyStore: new PrismaIdempotencyStore(prisma),  // custom idempotency store
}));
```

### Provision callback

Called once per connect (new workspace or returning agent). Return these fields:

```typescript
provision: async (ctx) => {
  // ctx.orgId           — stable org identifier from JWT
  // ctx.agentId         — agent UID
  // ctx.requestedScopes — scopes already validated against your tool's max
  // ctx.requestedLimits — limits already clamped to your tool's max
  // ctx.workspace       — { name, external_id? } from the agent's request
  // ctx.grantJti        — grant's unique ID (for auditing)

  const ws = await db.upsertWorkspace(ctx.orgId, ctx.workspace.name);
  const agent = await db.upsertAgent(ws.id, ctx.agentId, ctx.requestedScopes);
  return {
    workspaceId: ws.id,
    agentId: agent.id,
    type: 'http_signature',
    keyId: agent.keyId,
    algorithm: 'ed25519',
  };
}
```

### Custom stores (production / multi-replica)

The SDK ships with in-memory JTI and idempotency stores, which reset on restart and aren't shared across instances. For production:

```typescript
import { PrismaJtiStore, PrismaIdempotencyStore } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write'],
  jtiStore: new PrismaJtiStore(prisma),
  idempotencyStore: new PrismaIdempotencyStore(prisma),
  provision: prismaSignatureProvision(prisma),
}));
```

See `apps/example-tool-api/src/agentpi/stores.ts` for the Prisma implementation.

---

## Credential mode — HTTP Signatures

AgentPI uses [Vestauth](https://github.com/vestauth/vestauth) (RFC 9421) for both:

- **Grant requests** — agent signs `POST /v1/connect-grants` with its Ed25519 private key
- **Tool requests** — after connecting, the agent signs every API call; your tool verifies with the agent's public key

No shared secret. The connect response returns `{ type: 'http_signature', key_id, algorithm }`.

### "Continue with AgentPI" prompt

When `baseUrl` is set, any 401 response from your API automatically includes:

```json
{ "agentpi": { "prompt": "Continue with AgentPI", "discovery": "https://api.example.com/.well-known/agentpi.json" } }
```

The agent follows the `discovery` URL, connects, gets credentials, and retries — all automatic.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AGENTPI_PORT` | `4010` | AgentPI service port |
| `AGENTPI_ISSUER` | `https://agentpi.local` | JWT issuer claim |
| `AGENTPI_JWKS_URL` | `https://agentpi.local/.well-known/jwks.json` | JWKS endpoint for SDK JWT verification. **Must be HTTPS in production.** Use `http://localhost:4010/...` for local dev. |
| `AGENTPI_KEYS_DIR` | `.keys` | Service signing key directory |
| `AGENTPI_DEFAULT_SCOPES` | `read` | Default allowed scopes for new agents |
| `AGENTPI_DEFAULT_RPM` | `10` | Per-agent grant requests per minute |
| `AGENTPI_DEFAULT_DAILY_QUOTA` | `100` | Per-agent grant requests per day |
| `AGENTPI_DEFAULT_CONCURRENCY` | `1` | Default max concurrency limit |
| `AGENTPI_BLOCKED_AGENTS` | — | Comma-separated list of blocked agent UIDs (startup seed) |
| `AGENTPI_ADMIN_KEY` | — | Enables admin block/unblock endpoints when set |
| `AGENTPI_AGENT_POLICIES` | — | JSON: per-agent scope/limit overrides |
| `AGENTPI_TOOL_POLICIES` | — | JSON: per-tool scope/limit overrides |
| `AGENTPI_SERVICE_URL` | `http://localhost:4010` | CLI grant request URL |
| `AGENT_UID` | — | Agent identifier for signing grant requests |
| `AGENT_PRIVATE_JWK` | — | Ed25519 private JWK (Vestauth) |
| `TOOL_ID` | `tool_example` | Tool identifier |
| `TOOL_PORT` | `4020` | Example tool port |
| `DATABASE_URL` | `postgresql://...` | Postgres connection string |

---

## Admin endpoints

Require `x-agentpi-admin-key: <AGENTPI_ADMIN_KEY>` header.

```
POST /v1/agents/:agentUid/block
POST /v1/agents/:agentUid/unblock
```

**Note:** The block list is in-process memory only. It resets on restart and is not shared across replicas. For production, seed `AGENTPI_BLOCKED_AGENTS` and/or use an external store.

### Policy precedence

1. `AGENTPI_AGENT_POLICIES[agentUid]` (most specific)
2. `AGENTPI_TOOL_POLICIES[tool_id]`
3. Global defaults (`AGENTPI_DEFAULT_*`)

---

## Security model

| Protection | Mechanism |
|---|---|
| Grant authenticity | RS256 JWT signed by AgentPI, verified via JWKS |
| Agent identity | Vestauth HTTP Message Signatures (Ed25519) on grant requests |
| Replay prevention | JTI tracked per grant; each grant usable exactly once |
| Idempotency | `idempotency-key` header; same inputs → cached result; different inputs → 409 |
| Scope enforcement | SDK rejects scopes not offered by your tool (403) |
| Limit clamping | SDK clamps requested limits to tool-defined maximums |
| Rate limiting | HTTP-layer throttle (60 req/min per IP) + per-agent RPM/daily quota on grants |
| No shared secret | Agents sign requests with private key; tool verifies with public key |
| Admin key protection | Timing-safe comparison to prevent brute-force via response timing |
| Input validation | Scope strings validated as safe identifiers; workspace name capped at 255 chars |

---

## Error responses

All errors follow this shape:

```json
{ "error": { "code": "...", "message": "...", "detail": {} } }
```

| Status | Code | When |
|---|---|---|
| 400 | `missing_idempotency_key` | `idempotency-key` header absent |
| 401 | `invalid_grant` | Bad/expired JWT, or replay detected |
| 403 | `scopes_not_allowed` | Requested scopes not offered by tool |
| 409 | `idempotency_conflict` | Same idempotency key, different request body |

---

## Monorepo layout

```
agentpi/
├── apps/
│   ├── service/              # AgentPI authorization server (port 4010)
│   └── example-tool-api/     # Reference NestJS + Prisma tool implementation
├── packages/
│   ├── sdk/                  # Middleware for tool builders
│   ├── cli/                  # Agent-side CLI (connect / demo / verify)
│   └── shared/               # Shared types, constants, errors
├── docker-compose.yml        # PostgreSQL 16
└── .env.example
```

---

## Development

```bash
# Start everything
pnpm install
pnpm dev          # starts AgentPI service + example tool (requires Docker for Postgres)

# CLI commands
pnpm demo         # full connect flow end-to-end
pnpm verify       # 18-point protocol conformance check

# Build & test
pnpm build
pnpm test
```

Agent identity is auto-initialized on first `pnpm demo` / `pnpm verify`. Or run `vestauth agent init` manually to create `AGENT_UID` + `AGENT_PRIVATE_JWK` up front.

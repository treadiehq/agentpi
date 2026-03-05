# AgentPI

**"Continue with Google", but for AI agents.**

An agent hits your API, connects via AgentPI, and gets credentials in seconds. No signup form, no email, no human.

> Uses **[Vestauth](https://github.com/vestauth/vestauth)** for agent authentication.

---

## Add to your API in 2 steps

**1. Install**

```bash
npm install @agentpi/sdk
```

**2. Mount the middleware**

With Prisma (batteries included):

```typescript
import { agentpi, prismaSignatureProvision } from '@agentpi/sdk';

app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  provision: prismaSignatureProvision(prisma),
}));
```

Or bring your own database:

```typescript
app.use(agentpi({
  tool: 'my_tool',
  scopes: ['read', 'write', 'deploy'],
  provision: async (ctx) => {
    const ws = await db.upsertWorkspace(ctx.orgId, ctx.workspace.name);
    const agent = await db.upsertAgent(ws.id, ctx.agentId, ctx.requestedScopes);
    return { workspaceId: ws.id, agentId: agent.id, type: 'http_signature', keyId: agent.keyId, algorithm: 'ed25519' };
  },
}));
```

That's it. The SDK auto-mounts `GET /.well-known/agentpi.json` and `POST /v1/agentpi/connect`, and handles JWT verification, replay protection, idempotency, scope validation, and limit clamping.

---

## How it works

1. Agent discovers your tool via `GET /.well-known/agentpi.json`
2. Agent gets a signed short-lived JWT from the AgentPI service
3. Agent posts the JWT to `POST /v1/agentpi/connect`
4. Your tool provisions a workspace and returns credentials

Same flow whether it's a first-time signup or a returning agent — one endpoint, no branching.

---

## Try it locally

```bash
# Prerequisites: Node 20+, pnpm, Docker
pnpm install && pnpm dev

pnpm demo    # full connect flow
pnpm verify  # 18-point conformance check
```

---

## More

- [**DETAILED.md**](DETAILED.md) — architecture, config reference, custom stores, security model, error codes
- [`apps/example-tool-api`](apps/example-tool-api) — full NestJS + Prisma example
- [Vestauth](https://github.com/vestauth/vestauth) — HTTP signature auth used by agents

---

## License

[FSL-1.1-MIT](LICENSE)

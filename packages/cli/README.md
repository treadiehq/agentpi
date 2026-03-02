# AgentPI CLI

Dev CLI for testing the AgentPI connect flow. Not intended for production use — agents should call the HTTP protocol directly.

## Commands

### `connect`

Runs the full connect flow: discover → get grant → connect.

```bash
agentpi connect <toolBaseUrl> [options]
```

| Option | Default | Description |
|---|---|---|
| `--name` | `"My Workspace"` | Workspace name |
| `--scopes` | `read,deploy` | Comma-separated scopes |
| `--rpm` | `60` | Requests per minute |
| `--daily` | `500` | Daily quota |
| `--concurrency` | `1` | Concurrency limit |
| `--grant` | — | Reuse a specific grant JWT (for replay testing) |

Credentials are saved to `~/.agentpi/credentials.json`, keyed by tool base URL.

### `demo`

Runs the full flow end-to-end: connect, then call the tool's `/deploy` endpoint when API key credentials are returned.

```bash
agentpi demo <toolBaseUrl>
```

### `verify`

Runs conformance checks against a tool: discovery document structure, connect flow, response shape, replay protection, and idempotency conflict handling.

```bash
agentpi verify <toolBaseUrl>
```

## Running from the monorepo

```bash
# Via pnpm scripts (from repo root)
pnpm demo
pnpm verify

# Directly with tsx
pnpm tsx packages/cli/src/cli.ts connect http://localhost:4020
pnpm tsx packages/cli/src/cli.ts demo http://localhost:4020
pnpm tsx packages/cli/src/cli.ts verify http://localhost:4020
```

## Environment variables

Initialize your agent identity first:

```bash
vestauth agent init
```

| Variable | Default | Description |
|---|---|---|
| `AGENTPI_SERVICE_URL` | `http://localhost:4010` | AgentPI service URL |
| `AGENT_UID` | `agent-...` | Agent identity used by Vestauth for signing |
| `AGENT_PRIVATE_JWK` | _none_ | Ed25519 private JWK used by Vestauth to sign grant requests |

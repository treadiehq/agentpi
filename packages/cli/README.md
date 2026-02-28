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

Runs the full flow end-to-end: connect, then call the tool's `/deploy` endpoint with the returned API key.

```bash
agentpi demo <toolBaseUrl>
```

### `verify`

Runs 17 conformance checks against a tool: discovery document structure, connect flow, response shape, replay protection, and idempotency conflict handling.

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

| Variable | Default | Description |
|---|---|---|
| `AGENTPI_URL` | `http://localhost:4010` | AgentPI service URL |
| `AGENTPI_AGENT_API_KEY` | `agentpi_dev_key_12345` | Agent credential for requesting grants |

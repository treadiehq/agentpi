# AgentPI CLI

Scan any API for agent compatibility. Connect agents. Verify AgentPI integrations.

The CLI is mainly for local/dev workflows. Production agents should call the HTTP protocol directly from their runtime.

## Install

```bash
npm i -g @agentpi/cli
```

Or run without installing:

```bash
npx @agentpi/cli audit ./src
npx @agentpi/cli scan https://your-api.com
```

If you see `No matching version found` or `ETARGET`, use the latest (omit the version) or ensure your registry is `https://registry.npmjs.org/`.

## Commands

### `audit`

Scans a local TypeScript/JavaScript codebase for exported functions that agents could call, and classifies each one by risk level. Works on any codebase — no AgentPI installation required.

```bash
agentpi audit              # scan current directory
agentpi audit ./src        # scan a specific path
agentpi audit --json       # machine-readable JSON output (for CI)
agentpi audit --path ./src # explicit path flag
```

> **Note:** Detection is heuristic, based on function names and body patterns. It is a fast discovery tool, not a complete static analyser. Expect some false positives in v1.

### `scan`

Probes any API cold, no AgentPI required, and reports which agent auth capabilities are present or missing.

```bash
agentpi scan <toolBaseUrl>
```

### `verify`

Deep protocol conformance check, use this after installing AgentPI to validate your integration. Requires the AgentPI service to be running.

```bash
agentpi verify <toolBaseUrl>
```

Checks discovery shape, connect flow, response shape, replay protection, and idempotency conflict behaviour across 17 points.

### `connect`

Runs the full connect flow: discover → grant → connect.

```bash
agentpi connect <toolBaseUrl> [options]
```

| Option | Default | Description |
| --- | --- | --- |
| `--name` | `"My Workspace"` | Workspace name |
| `--scopes` | `read,deploy` | Comma-separated scopes |
| `--rpm` | `60` | Requests per minute |
| `--daily` | `500` | Daily quota |
| `--concurrency` | `1` | Concurrency limit |
| `--grant` | - | Reuse a specific grant JWT (replay testing) |

The CLI saves credentials to `~/.agentpi/credentials.json`, keyed by tool base URL.

### `demo`

Runs the connect flow and prints resulting credentials. In `http_signature` mode it shows `key_id` and `algorithm` and does not auto-call a signed tool endpoint.

```bash
agentpi demo <toolBaseUrl>
```

## Vestauth auto-init

`connect` and `verify` automatically initialize Vestauth identity on first run (equivalent to `vestauth agent init`) if signing keys are missing.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `AGENTPI_SERVICE_URL` | `http://localhost:4010` | AgentPI service URL for grant requests |
| `AGENT_UID` | `agent-...` | Agent UID used for HTTP signature identity |
| `AGENT_PRIVATE_JWK` | _none_ | Ed25519 private JWK used to sign grant requests |

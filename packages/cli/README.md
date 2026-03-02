# AgentPI CLI

CLI for testing and onboarding the AgentPI connect flow.

The CLI is mainly for local/dev workflows. Production agents should call the HTTP protocol directly from their runtime.

## Install

```bash
npm i -g @agentpi/cli
```

## Commands

### `connect`

Runs the full connect flow: discover -> grant -> connect.

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

### `verify`

Runs conformance checks against a tool: discovery shape, connect flow, response shape, replay protection, and idempotency conflict behavior.

```bash
agentpi verify <toolBaseUrl>
```

## Vestauth auto-init

`connect` and `verify` automatically initialize Vestauth identity on first run (equivalent to `vestauth agent init`) if signing keys are missing.

## Environment variables

| Variable | Default | Description |
| --- | --- | --- |
| `AGENTPI_SERVICE_URL` | `http://localhost:4010` | AgentPI service URL for grant requests |
| `AGENT_UID` | `agent-...` | Agent UID used for HTTP signature identity |
| `AGENT_PRIVATE_JWK` | _none_ | Ed25519 private JWK used to sign grant requests |

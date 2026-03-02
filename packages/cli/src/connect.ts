import { v4 as uuid } from 'uuid';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { homedir } from 'os';
import {
  DiscoveryDocument,
  ConnectGrantResponse,
  ConnectResult,
  AGENT_KEY_HEADER,
} from '@agentpi/shared';

interface ConnectOptions {
  toolBaseUrl: string;
  name: string;
  scopes: string[];
  rpm: number;
  daily: number;
  concurrency: number;
  reuseGrant?: string;
}

const AGENTPI_URL = process.env.AGENTPI_SERVICE_URL || 'http://localhost:4010';
const AGENT_KEY = process.env.AGENTPI_AGENT_API_KEY || 'agentpi_dev_key_12345';

export async function connect(opts: ConnectOptions) {
  console.log(`\n🔍 Discovering tool at ${opts.toolBaseUrl}...`);

  const discoveryRes = await fetch(
    `${opts.toolBaseUrl}/.well-known/agentpi.json`,
  );
  if (!discoveryRes.ok) {
    throw new Error(`Discovery failed: ${discoveryRes.status}`);
  }
  const discovery = (await discoveryRes.json()) as DiscoveryDocument;
  console.log(`   Tool: ${discovery.tool_name} (${discovery.tool_id})`);
  console.log(`   Plan: ${discovery.default_plan_id}`);
  console.log(`   Scopes: ${discovery.plans[0]?.scopes_allowed.join(', ')}`);

  let connectGrant: string;

  if (opts.reuseGrant) {
    console.log(`\n🔑 Reusing provided grant JWT (replay test)...`);
    connectGrant = opts.reuseGrant;
  } else {
    console.log(`\n🔑 Requesting connect grant from AgentPI...`);
    const grantRes = await fetch(`${AGENTPI_URL}/v1/connect-grants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_KEY_HEADER]: AGENT_KEY,
      },
      body: JSON.stringify({
        tool_id: discovery.tool_id,
        requested_scopes: opts.scopes,
        requested_limits: {
          rpm: opts.rpm,
          dailyQuota: opts.daily,
          concurrency: opts.concurrency,
        },
        workspace: { name: opts.name },
        nonce: uuid(),
      }),
    });

    if (!grantRes.ok) {
      const err = await grantRes.json().catch(() => ({}));
      throw new Error(
        `Grant request failed: ${grantRes.status} ${JSON.stringify(err)}`,
      );
    }

    const grant = (await grantRes.json()) as ConnectGrantResponse;
    connectGrant = grant.connect_grant;
    console.log(`   Grant issued (expires in ${grant.expires_in}s)`);
  }

  const idempotencyKey = uuid();
  console.log(`\n🔗 Connecting to tool...`);
  console.log(`   Idempotency-Key: ${idempotencyKey}`);

  const connectUrl = `${opts.toolBaseUrl}${discovery.connect_endpoint}`;
  const connectRes = await fetch(connectUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${connectGrant}`,
      [discovery.idempotency.header]: idempotencyKey,
    },
  });

  if (!connectRes.ok) {
    const err = await connectRes.json().catch(() => ({}));
    throw new Error(
      `Connect failed: ${connectRes.status} ${JSON.stringify(err)}`,
    );
  }

  const result = (await connectRes.json()) as ConnectResult;
  console.log(`\n✅ Connected!`);
  console.log(`   Workspace: ${result.tool_workspace_id}`);
  console.log(`   Agent:     ${result.tool_agent_id}`);
  if (result.credentials.type === 'http_signature') {
    console.log(`   Auth:      HTTP Signature (${result.credentials.algorithm})`);
    console.log(`   Key ID:    ${result.credentials.key_id}`);
  } else {
    console.log(`   API Key:   ${result.credentials.api_key}`);
  }
  console.log(`   Scopes:    ${result.applied_scopes.join(', ')}`);
  console.log(`   Limits:    RPM=${result.applied_limits.rpm} Daily=${result.applied_limits.dailyQuota} Concurrency=${result.applied_limits.concurrency}`);

  await storeCredentials(opts.toolBaseUrl, result, connectGrant);

  return result;
}

async function storeCredentials(
  toolBaseUrl: string,
  result: ConnectResult,
  grant: string,
) {
  const dir = resolve(homedir(), '.agentpi');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const credsPath = resolve(dir, 'credentials.json');
  let creds: Record<string, unknown> = {};
  if (existsSync(credsPath)) {
    try {
      creds = JSON.parse(await readFile(credsPath, 'utf-8'));
    } catch {
      creds = {};
    }
  }

  const entry: Record<string, unknown> = {
    tool_workspace_id: result.tool_workspace_id,
    tool_agent_id: result.tool_agent_id,
    credential_type: result.credentials.type,
    applied_scopes: result.applied_scopes,
    applied_limits: result.applied_limits,
    last_grant: grant,
    connected_at: new Date().toISOString(),
  };

  if (result.credentials.type === 'http_signature') {
    entry.key_id = result.credentials.key_id;
    entry.algorithm = result.credentials.algorithm;
  } else {
    entry.api_key = result.credentials.api_key;
  }

  creds[toolBaseUrl] = entry;

  await writeFile(credsPath, JSON.stringify(creds, null, 2));
  console.log(`\n💾 Credentials saved to ${credsPath}`);
}

import { v4 as uuid } from 'uuid';
import {
  DiscoveryDocument,
  ConnectGrantResponse,
  ConnectResult,
  AGENT_KEY_HEADER,
  AGENTPI_VERSION,
} from '@agentpi/shared';

const AGENTPI_URL = process.env.AGENTPI_SERVICE_URL || 'http://localhost:4010';
const AGENT_KEY = process.env.AGENTPI_AGENT_API_KEY || 'agentpi_dev_key_12345';

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

const checks: Check[] = [];

function pass(name: string, detail?: string) {
  checks.push({ name, pass: true, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name: string, detail: string) {
  checks.push({ name, pass: false, detail });
  console.log(`  ❌ ${name} — ${detail}`);
}

export async function verify(toolBaseUrl: string) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║        AgentPI Conformance Verifier           ║');
  console.log('╚═══════════════════════════════════════════════╝');
  console.log(`\nTarget: ${toolBaseUrl}`);

  // 1. Discovery
  console.log('\n── Discovery ──');
  let discovery: DiscoveryDocument;
  try {
    const res = await fetch(`${toolBaseUrl}/.well-known/agentpi.json`);
    if (!res.ok) { fail('GET /.well-known/agentpi.json', `HTTP ${res.status}`); return summarize(); }
    discovery = (await res.json()) as DiscoveryDocument;
    pass('GET /.well-known/agentpi.json', `${res.status} OK`);
  } catch (err) {
    fail('GET /.well-known/agentpi.json', `unreachable — ${err}`);
    return summarize();
  }

  // 2. Validate discovery fields
  console.log('\n── Discovery document ──');
  if (discovery.agentpi_version === AGENTPI_VERSION) {
    pass('agentpi_version', discovery.agentpi_version);
  } else {
    fail('agentpi_version', `expected ${AGENTPI_VERSION}, got ${discovery.agentpi_version}`);
  }

  if (discovery.tool_id) pass('tool_id', discovery.tool_id);
  else fail('tool_id', 'missing');

  if (discovery.tool_name) pass('tool_name', discovery.tool_name);
  else fail('tool_name', 'missing');

  if (discovery.connect_endpoint) pass('connect_endpoint', discovery.connect_endpoint);
  else fail('connect_endpoint', 'missing');

  if (discovery.plans?.length > 0) {
    pass('plans', `${discovery.plans.length} plan(s): ${discovery.plans.map(p => p.plan_id).join(', ')}`);
    const plan = discovery.plans[0];
    if (plan.max_limits && plan.scopes_allowed?.length > 0) {
      pass('plan[0] structure', `scopes=[${plan.scopes_allowed.join(',')}] rpm=${plan.max_limits.rpm}`);
    } else {
      fail('plan[0] structure', 'missing max_limits or scopes_allowed');
    }
  } else {
    fail('plans', 'missing or empty');
  }

  if (discovery.idempotency?.header) pass('idempotency.header', discovery.idempotency.header);
  else fail('idempotency.header', 'missing');

  // 3. Connect flow
  console.log('\n── Connect flow ──');
  let grant: string;
  try {
    const grantRes = await fetch(`${AGENTPI_URL}/v1/connect-grants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_KEY_HEADER]: AGENT_KEY,
      },
      body: JSON.stringify({
        tool_id: discovery.tool_id,
        requested_scopes: discovery.plans[0]?.scopes_allowed?.slice(0, 2) || ['read'],
        requested_limits: discovery.default_limits || { rpm: 60, dailyQuota: 500, concurrency: 1 },
        workspace: { name: 'Verify Test' },
        nonce: uuid(),
      }),
    });
    if (!grantRes.ok) {
      fail('Obtain connect grant', `HTTP ${grantRes.status}`);
      return summarize();
    }
    const grantBody = (await grantRes.json()) as ConnectGrantResponse;
    grant = grantBody.connect_grant;
    pass('Obtain connect grant', `expires_in=${grantBody.expires_in}s`);
  } catch (err) {
    fail('Obtain connect grant', `AgentPI service unreachable at ${AGENTPI_URL}`);
    return summarize();
  }

  // 4. POST connect
  const idempotencyKey = uuid();
  let connectResult: ConnectResult;
  try {
    const connectUrl = `${toolBaseUrl}${discovery.connect_endpoint}`;
    const connectRes = await fetch(connectUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${grant}`,
        [discovery.idempotency.header]: idempotencyKey,
      },
    });
    if (!connectRes.ok) {
      const errBody = await connectRes.json().catch(() => ({}));
      fail('POST connect', `HTTP ${connectRes.status}: ${JSON.stringify(errBody)}`);
      return summarize();
    }
    connectResult = (await connectRes.json()) as ConnectResult;
    pass('POST connect', `status=${connectResult.status}`);
  } catch (err) {
    fail('POST connect', String(err));
    return summarize();
  }

  // 5. Validate connect response
  console.log('\n── Connect response ──');
  if (connectResult.tool_workspace_id) pass('tool_workspace_id', connectResult.tool_workspace_id);
  else fail('tool_workspace_id', 'missing');

  if (connectResult.tool_agent_id) pass('tool_agent_id', connectResult.tool_agent_id);
  else fail('tool_agent_id', 'missing');

  if (connectResult.credentials?.type === 'api_key' && connectResult.credentials.api_key) {
    pass('credentials', `type=api_key prefix=${connectResult.credentials.api_key.slice(0, 16)}...`);
  } else {
    fail('credentials', 'missing or invalid type');
  }

  if (connectResult.applied_scopes?.length > 0) pass('applied_scopes', connectResult.applied_scopes.join(', '));
  else fail('applied_scopes', 'missing or empty');

  if (connectResult.applied_limits) pass('applied_limits', `rpm=${connectResult.applied_limits.rpm}`);
  else fail('applied_limits', 'missing');

  // 6. Replay protection
  console.log('\n── Replay protection ──');
  try {
    const replayRes = await fetch(`${toolBaseUrl}${discovery.connect_endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${grant}`,
        [discovery.idempotency.header]: uuid(),
      },
    });
    if (replayRes.status === 401) {
      const body = await replayRes.json().catch(() => ({})) as Record<string, unknown>;
      const err = body.error as Record<string, unknown> | undefined;
      pass('Reused JTI rejected', `401 ${err?.code || 'invalid_grant'}`);
    } else {
      fail('Reused JTI rejected', `expected 401, got ${replayRes.status}`);
    }
  } catch (err) {
    fail('Reused JTI rejected', String(err));
  }

  // 7. Idempotency conflict
  console.log('\n── Idempotency ──');
  try {
    const grant2Res = await fetch(`${AGENTPI_URL}/v1/connect-grants`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [AGENT_KEY_HEADER]: AGENT_KEY,
      },
      body: JSON.stringify({
        tool_id: discovery.tool_id,
        requested_scopes: discovery.plans[0]?.scopes_allowed || ['read'],
        requested_limits: discovery.default_limits || { rpm: 60, dailyQuota: 500, concurrency: 1 },
        workspace: { name: 'Different Workspace For Conflict' },
        nonce: uuid(),
      }),
    });
    const grant2 = ((await grant2Res.json()) as ConnectGrantResponse).connect_grant;

    const conflictRes = await fetch(`${toolBaseUrl}${discovery.connect_endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${grant2}`,
        [discovery.idempotency.header]: idempotencyKey,
      },
    });
    if (conflictRes.status === 409) {
      pass('Idempotency conflict (same key, different inputs)', '409');
    } else {
      fail('Idempotency conflict', `expected 409, got ${conflictRes.status}`);
    }
  } catch (err) {
    fail('Idempotency conflict', String(err));
  }

  summarize();
}

function summarize() {
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass).length;
  const total = checks.length;

  console.log('\n══════════════════════════════════════════');
  if (failed === 0) {
    console.log(`  ✅ All ${total} checks passed`);
  } else {
    console.log(`  ${passed}/${total} passed, ${failed} failed`);
    console.log('');
    checks.filter((c) => !c.pass).forEach((c) => {
      console.log(`  ❌ ${c.name}: ${c.detail}`);
    });
  }
  console.log('══════════════════════════════════════════');
  console.log('');

  if (failed > 0) process.exit(1);
}

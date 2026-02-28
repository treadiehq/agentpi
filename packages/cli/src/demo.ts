import { connect } from './connect';
import { DiscoveryDocument } from '@agentpi/shared';

export async function demo(toolBaseUrl: string) {
  console.log('');
  console.log('╔═══════════════════════════════════════════════╗');
  console.log('║          AgentPI — One-Command Demo           ║');
  console.log('╚═══════════════════════════════════════════════╝');

  // Step 1: Connect
  console.log('\n━━━ Step 1: Connect (signup or login) ━━━');
  const result = await connect({
    toolBaseUrl,
    name: 'Demo Workspace',
    scopes: ['read', 'deploy'],
    rpm: 60,
    daily: 500,
    concurrency: 1,
  });

  // Step 2: Use the credentials
  console.log('\n━━━ Step 2: Call tool API with returned credentials ━━━');
  console.log(`\n📡 POST ${toolBaseUrl}/deploy`);

  const deployRes = await fetch(`${toolBaseUrl}/deploy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${result.credentials.api_key}`,
    },
  });

  if (!deployRes.ok) {
    const err = await deployRes.json().catch(() => ({}));
    console.log(`\n❌ API call failed: ${deployRes.status}`);
    console.log(JSON.stringify(err, null, 2));
  } else {
    const body = await deployRes.json();
    console.log(`\n✅ API call succeeded:`);
    console.log(JSON.stringify(body, null, 2));
  }

  // Summary
  console.log('\n━━━ Summary ━━━');
  console.log(`   Agent connected → workspace created → API call works`);
  console.log(`   Workspace:  ${result.tool_workspace_id}`);
  console.log(`   API Key:    ${result.credentials.api_key}`);
  console.log(`   Scopes:     ${result.applied_scopes.join(', ')}`);
  console.log('');
}

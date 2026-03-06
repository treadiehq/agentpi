#!/usr/bin/env node
import { connect } from './connect';
import { demo } from './demo';
import { scan } from './scan';
import { verify } from './verify';
import { runAudit } from './audit/index';

const args = process.argv.slice(2);
const command = args[0];

function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function printUsage() {
  console.error('Usage:');
  console.error('  agentpi audit [path] [--json]              Audit codebase for agent-callable tool risks');
  console.error('  agentpi scan <toolBaseUrl>                 Scan any API for agent compatibility');
  console.error('  agentpi connect <toolBaseUrl> [options]    Connect an agent to a tool');
  console.error('  agentpi demo <toolBaseUrl>                 Full demo: connect + API call');
  console.error('  agentpi verify <toolBaseUrl>               Protocol conformance check (post-install)');
  console.error('');
  console.error('Audit options:');
  console.error('  [path]             Path to scan (default: current directory)');
  console.error('  --path <path>      Explicit path (overrides positional)');
  console.error('  --json             Output machine-readable JSON');
  console.error('');
  console.error('Connect options:');
  console.error('  --name <name>      Workspace name (default: "My Workspace")');
  console.error('  --scopes <s,s>     Comma-separated scopes (default: "read,deploy")');
  console.error('  --rpm <n>          Requests per minute (default: 60)');
  console.error('  --daily <n>        Daily quota (default: 500)');
  console.error('  --concurrency <n>  Concurrency limit (default: 1)');
  console.error('  --grant <jwt>      Reuse a specific grant JWT (for replay testing)');
}

if (!command) {
  printUsage();
  process.exit(1);
}

// audit command — second arg is optional
if (command === 'audit') {
  const explicitPath = getArg('--path', '');
  const positionalPath = args[1] && !args[1].startsWith('--') ? args[1] : '';
  const targetPath = explicitPath || positionalPath || '.';
  const json = hasFlag('--json');

  runAudit({ path: targetPath, json }).catch((err) => {
    console.error('\n❌ Audit failed:', err.message || err);
    process.exit(1);
  });
  process.exitCode = 0;
} else {
  // All other commands require a second positional argument (toolBaseUrl)
  if (!args[1]) {
    printUsage();
    process.exit(1);
  }

  const toolBaseUrl = args[1].replace(/\/$/, '');

  switch (command) {
    case 'connect': {
      const name = getArg('--name', 'My Workspace');
      const scopes = getArg('--scopes', 'read,deploy').split(',');
      const rpm = parseInt(getArg('--rpm', '60'), 10);
      const daily = parseInt(getArg('--daily', '500'), 10);
      const concurrency = parseInt(getArg('--concurrency', '1'), 10);
      const reuseGrant = getArg('--grant', '');

      connect({
        toolBaseUrl,
        name,
        scopes,
        rpm,
        daily,
        concurrency,
        reuseGrant: reuseGrant || undefined,
      }).catch((err) => {
        console.error('\n❌ Connect failed:', err.message || err);
        process.exit(1);
      });
      break;
    }
    case 'demo':
      demo(toolBaseUrl).catch((err) => {
        console.error('\n❌ Demo failed:', err.message || err);
        process.exit(1);
      });
      break;
    case 'scan':
      scan(toolBaseUrl).catch((err) => {
        console.error('\n❌ Scan failed:', err.message || err);
        process.exit(1);
      });
      break;
    case 'verify':
      verify(toolBaseUrl).catch((err) => {
        console.error('\n❌ Verify failed:', err.message || err);
        process.exit(1);
      });
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

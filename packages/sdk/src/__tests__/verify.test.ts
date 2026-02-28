import * as jose from 'jose';
import { InvalidGrantError } from '@agentpi/shared';
import { verifyConnectGrant } from '../verify';
import { createServer } from 'http';
import type { Server } from 'http';

let server: Server;
let jwksUrl: string;
let privateKey: jose.KeyLike;
let kid: string;

beforeAll(async () => {
  const { publicKey, privateKey: pk } = await jose.generateKeyPair('RS256', {
    extractable: true,
  });
  privateKey = pk;
  const pubJwk = await jose.exportJWK(publicKey);
  kid = 'test-kid';
  pubJwk.kid = kid;
  pubJwk.use = 'sig';
  pubJwk.alg = 'RS256';

  const jwks = { keys: [pubJwk] };

  server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(jwks));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        jwksUrl = `http://127.0.0.1:${addr.port}/jwks`;
      }
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

async function signToken(claims: Record<string, unknown>, exp = '5m') {
  return new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);
}

describe('verifyConnectGrant', () => {
  it('verifies a valid grant and extracts claims', async () => {
    const token = await signToken({
      iss: 'https://agentpi.local',
      aud: 'tool_example',
      sub: 'agent_demo',
      jti: 'test-jti-1',
      agentpi: {
        org_id: 'org_demo',
        tool_id: 'tool_example',
        mode: 'autonomous',
        scopes: ['read'],
        limits: { rpm: 60, dailyQuota: 500, concurrency: 1 },
        workspace: { name: 'Test' },
        nonce: 'n1',
      },
    });

    const result = await verifyConnectGrant(
      token,
      jwksUrl,
      'https://agentpi.local',
      'tool_example',
    );

    expect(result.sub).toBe('agent_demo');
    expect(result.jti).toBe('test-jti-1');
    expect(result.agentpi.org_id).toBe('org_demo');
    expect(result.agentpi.scopes).toEqual(['read']);
  });

  it('rejects wrong audience with specific message', async () => {
    const token = await signToken({
      iss: 'https://agentpi.local',
      aud: 'wrong_tool',
      sub: 'agent_demo',
      jti: 'test-jti-2',
      agentpi: { org_id: 'org_demo', tool_id: 'wrong_tool' },
    });

    await expect(
      verifyConnectGrant(token, jwksUrl, 'https://agentpi.local', 'tool_example'),
    ).rejects.toThrow(/aud mismatch.*expected tool_example/);
  });

  it('rejects wrong audience as InvalidGrantError with detail', async () => {
    const token = await signToken({
      iss: 'https://agentpi.local',
      aud: 'wrong_tool',
      sub: 'agent_demo',
      jti: 'test-jti-2b',
      agentpi: { org_id: 'org_demo', tool_id: 'wrong_tool' },
    });

    try {
      await verifyConnectGrant(token, jwksUrl, 'https://agentpi.local', 'tool_example');
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidGrantError);
      const e = err as InvalidGrantError;
      expect(e.statusCode).toBe(401);
      expect(e.detail?.reason).toBe('aud_mismatch');
      expect(e.detail?.expected).toBe('tool_example');
      expect(e.detail?.got).toBe('wrong_tool');
    }
  });

  it('rejects expired token with specific message', async () => {
    const token = await signToken(
      {
        iss: 'https://agentpi.local',
        aud: 'tool_example',
        sub: 'agent_demo',
        jti: 'test-jti-3',
        agentpi: { org_id: 'org_demo', tool_id: 'tool_example' },
      },
      '0s',
    );

    await new Promise((r) => setTimeout(r, 1100));

    await expect(
      verifyConnectGrant(token, jwksUrl, 'https://agentpi.local', 'tool_example'),
    ).rejects.toThrow(/expired/);
  }, 10_000);

  it('rejects token missing agentpi claim', async () => {
    const token = await signToken({
      iss: 'https://agentpi.local',
      aud: 'tool_example',
      sub: 'agent_demo',
      jti: 'test-jti-4',
    });

    await expect(
      verifyConnectGrant(token, jwksUrl, 'https://agentpi.local', 'tool_example'),
    ).rejects.toThrow(/Missing required JWT claim: agentpi/);
  });

  it('rejects token missing jti claim', async () => {
    const token = await signToken({
      iss: 'https://agentpi.local',
      aud: 'tool_example',
      sub: 'agent_demo',
      agentpi: { org_id: 'org_demo' },
    });

    await expect(
      verifyConnectGrant(token, jwksUrl, 'https://agentpi.local', 'tool_example'),
    ).rejects.toThrow(/Missing required JWT claim: jti/);
  });
});

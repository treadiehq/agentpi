import { Controller, Post, Body, Req, BadRequestException, Headers, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GrantsService } from './grants.service';
import { ConnectGrantRequest } from '@agentpi/shared';

/** Pattern for valid agent UIDs — must be a UUID v4. */
const AGENT_UID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller('v1')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  // Tighter throttle on admin endpoints: 10 requests per minute per IP.
  // This limits timing-based brute-force attempts against the admin key.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('agents/:agentUid/block')
  blockAgent(
    @Headers('x-agentpi-admin-key') adminKey: string | undefined,
    @Param('agentUid') agentUid: string,
  ) {
    if (!AGENT_UID_PATTERN.test(agentUid)) {
      throw new BadRequestException('agentUid must be a valid UUID');
    }
    this.grants.requireAdmin(adminKey);
    this.grants.blockAgent(agentUid);
    return { ok: true, blocked: true, agent_uid: agentUid };
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('agents/:agentUid/unblock')
  unblockAgent(
    @Headers('x-agentpi-admin-key') adminKey: string | undefined,
    @Param('agentUid') agentUid: string,
  ) {
    if (!AGENT_UID_PATTERN.test(agentUid)) {
      throw new BadRequestException('agentUid must be a valid UUID');
    }
    this.grants.requireAdmin(adminKey);
    this.grants.unblockAgent(agentUid);
    return { ok: true, blocked: false, agent_uid: agentUid };
  }

  @Post('connect-grants')
  async issueGrant(
    @Req() req: any,
    @Body() body: ConnectGrantRequest,
  ) {
    const protocol =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
      req.protocol ||
      'http';
    const host =
      (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
      req.headers.host;
    if (!host) {
      throw new BadRequestException('Missing host header');
    }
    const uri = `${protocol}://${host}${req.url}`;
    const agentUid = await this.grants.verifyAgentSignature(
      req.method,
      uri,
      req.headers as Record<string, string | string[] | undefined>,
    );
    return this.grants.issueGrant(body, agentUid);
  }
}

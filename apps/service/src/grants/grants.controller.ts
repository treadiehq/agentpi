import { Controller, Post, Body, Req, BadRequestException, Headers, Param } from '@nestjs/common';
import { GrantsService } from './grants.service';
import { ConnectGrantRequest } from '@agentpi/shared';

@Controller('v1')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  @Post('agents/:agentUid/block')
  blockAgent(
    @Headers('x-agentpi-admin-key') adminKey: string | undefined,
    @Param('agentUid') agentUid: string,
  ) {
    this.grants.requireAdmin(adminKey);
    this.grants.blockAgent(agentUid);
    return { ok: true, blocked: true, agent_uid: agentUid };
  }

  @Post('agents/:agentUid/unblock')
  unblockAgent(
    @Headers('x-agentpi-admin-key') adminKey: string | undefined,
    @Param('agentUid') agentUid: string,
  ) {
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

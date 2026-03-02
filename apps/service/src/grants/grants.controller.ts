import { Controller, Post, Body, Req, BadRequestException } from '@nestjs/common';
import { GrantsService } from './grants.service';
import { ConnectGrantRequest } from '@agentpi/shared';

@Controller('v1')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

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

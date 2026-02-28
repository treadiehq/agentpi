import { Controller, Post, Body, Headers } from '@nestjs/common';
import { GrantsService } from './grants.service';
import { ConnectGrantRequest } from '@agentpi/shared';
import { AGENT_KEY_HEADER } from '@agentpi/shared';

@Controller('v1')
export class GrantsController {
  constructor(private readonly grants: GrantsService) {}

  @Post('connect-grants')
  async issueGrant(
    @Headers(AGENT_KEY_HEADER) agentKey: string,
    @Body() body: ConnectGrantRequest,
  ) {
    this.grants.validateAgentKey(agentKey);
    return this.grants.issueGrant(body);
  }
}

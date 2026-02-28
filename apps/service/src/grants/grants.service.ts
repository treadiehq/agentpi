import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { KeysService } from '../keys/keys.service';
import { v4 as uuid } from 'uuid';
import {
  ConnectGrantRequest,
  ConnectGrantResponse,
  Claim,
  GRANT_TTL_SECONDS,
} from '@agentpi/shared';

@Injectable()
export class GrantsService {
  private readonly issuer = process.env.AGENTPI_ISSUER || 'https://agentpi.local';
  private readonly agentApiKey = process.env.AGENTPI_AGENT_API_KEY || '';
  private readonly toolId = process.env.TOOL_ID || 'tool_example';

  constructor(private readonly keys: KeysService) {}

  validateAgentKey(key: string | undefined) {
    if (!key || key !== this.agentApiKey) {
      throw new UnauthorizedException('Invalid agent API key');
    }
  }

  async issueGrant(body: ConnectGrantRequest): Promise<ConnectGrantResponse> {
    if (body.tool_id !== this.toolId) {
      throw new ForbiddenException(`Unknown tool_id: ${body.tool_id}`);
    }

    const jti = uuid();
    const agentpi: Claim = {
      org_id: 'org_demo',
      tool_id: body.tool_id,
      mode: 'autonomous',
      requested_plan_id: 'free',
      scopes: body.requested_scopes,
      limits: body.requested_limits,
      workspace: body.workspace,
      nonce: body.nonce,
    };

    const token = await this.keys.signGrant(
      {
        iss: this.issuer,
        aud: body.tool_id,
        sub: 'agent_demo',
        jti,
        agentpi,
      },
      GRANT_TTL_SECONDS,
    );

    return { connect_grant: token, expires_in: GRANT_TTL_SECONDS };
  }
}

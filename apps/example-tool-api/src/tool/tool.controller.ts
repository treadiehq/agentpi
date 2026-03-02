import {
  Controller,
  Get,
  Post,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import vestauth from 'vestauth';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class ToolController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('hello')
  hello() {
    return { message: 'Hello from Example Tool API!' };
  }

  @Post('deploy')
  async deploy(@Req() req: FastifyRequest) {
    const protocol =
      (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim() ||
      req.protocol ||
      'http';
    const host =
      (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim() ||
      req.headers.host;
    if (!host) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Missing host header' } },
        HttpStatus.UNAUTHORIZED,
      );
    }
    const uri = `${protocol}://${host}${req.url}`;

    let agentUid = '';
    try {
      const verified = await vestauth.provider.verify(
        req.method,
        uri,
        req.headers as Record<string, string | string[] | undefined>,
      );
      agentUid = verified.uid || '';
    } catch (error) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Invalid HTTP signature' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!agentUid) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Missing agent identity' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const agent = await this.prisma.toolAgent.findFirst({
      where: {
        agentpiAgentId: agentUid,
        status: 'active',
      },
    });
    if (!agent) {
      throw new HttpException(
        { error: { code: 'forbidden', message: 'Agent is not provisioned for this tool' } },
        HttpStatus.FORBIDDEN,
      );
    }

    return {
      deployed: true,
      message: 'Deployment successful!',
      workspace_id: agent.workspaceId,
      timestamp: new Date().toISOString(),
    };
  }
}

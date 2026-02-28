import { Controller, Get, Post, Req, Res, OnModuleInit } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { resolveConfig, createDiscoveryHandler, createConnectHandler, prismaProvision } from '@agentpi/sdk';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaJtiStore, PrismaIdempotencyStore } from './stores';

@Controller()
export class ConnectController implements OnModuleInit {
  private discoveryHandler!: ReturnType<typeof createDiscoveryHandler>;
  private connectHandler!: ReturnType<typeof createConnectHandler>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    const resolved = resolveConfig({
      tool: 'tool_example',
      scopes: ['read', 'deploy', 'write'],
      limits: { rpm: 120, dailyQuota: 1000, concurrency: 5 },
      jtiStore: new PrismaJtiStore(this.prisma),
      idempotencyStore: new PrismaIdempotencyStore(this.prisma),
      provision: prismaProvision(this.prisma),
    });

    this.discoveryHandler = createDiscoveryHandler(resolved);
    this.connectHandler = createConnectHandler(resolved);
  }

  @Get('.well-known/agentpi.json')
  discovery(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    this.discoveryHandler(req, { send: (body: unknown) => reply.send(body) });
  }

  @Post('v1/agentpi/connect')
  async connect(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const adapted = {
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: req.body,
    };
    const res = {
      status: (code: number) => { reply.status(code); return res; },
      send: (body: unknown) => reply.send(body),
    };
    await this.connectHandler(adapted, res);
  }
}

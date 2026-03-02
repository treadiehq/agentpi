import { ProvisionContext } from '@agentpi/shared';
import { ProvisionResult } from '@agentpi/sdk';
import { PrismaService } from '../prisma/prisma.service';

export function createProvisionFn(prisma: PrismaService) {
  return async (ctx: ProvisionContext): Promise<ProvisionResult> => {
    const workspace = await prisma.workspace.upsert({
      where: { orgId: ctx.orgId },
      create: { orgId: ctx.orgId, name: ctx.workspace.name, planId: 'free' },
      update: { name: ctx.workspace.name },
    });

    const agent = await prisma.toolAgent.upsert({
      where: {
        workspaceId_agentpiAgentId: {
          workspaceId: workspace.id,
          agentpiAgentId: ctx.agentId,
        },
      },
      create: { workspaceId: workspace.id, agentpiAgentId: ctx.agentId, status: 'active' },
      update: { status: 'active' },
    });
    const keyId = `${ctx.agentId}@${workspace.id}`;

    return {
      workspaceId: workspace.id,
      agentId: agent.id,
      type: 'http_signature',
      keyId,
      algorithm: 'ed25519',
    };
  };
}

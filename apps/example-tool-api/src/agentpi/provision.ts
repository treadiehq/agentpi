import { randomBytes, createHash } from 'crypto';
import { ProvisionContext } from '@agentpi/shared';
import { ProvisionResult } from '@agentpi/sdk';
import { PrismaService } from '../prisma/prisma.service';

function generateApiKey(): { full: string; prefix: string; secret: string } {
  const prefixBytes = randomBytes(4).toString('hex');
  const secretBytes = randomBytes(24).toString('base64url');
  const prefix = `tk_live_${prefixBytes}`;
  const full = `${prefix}_${secretBytes}`;
  return { full, prefix, secret: secretBytes };
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

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

    const { full, prefix, secret } = generateApiKey();

    await prisma.toolApiKey.create({
      data: {
        workspaceId: workspace.id,
        toolAgentId: agent.id,
        hashedSecret: hashSecret(secret),
        prefix,
        scopes: ctx.requestedScopes,
      },
    });

    return {
      workspaceId: workspace.id,
      agentId: agent.id,
      apiKey: full,
    };
  };
}

import { randomBytes, createHash } from 'crypto';
import { ProvisionContext } from '@agentpi/shared';
import { ProvisionResult } from './config';

interface PrismaLike {
  workspace: {
    upsert(args: {
      where: { orgId: string };
      create: { orgId: string; name: string; planId: string };
      update: { name: string };
    }): Promise<{ id: string }>;
  };
  toolAgent: {
    upsert(args: {
      where: { workspaceId_agentpiAgentId: { workspaceId: string; agentpiAgentId: string } };
      create: { workspaceId: string; agentpiAgentId: string; status: string };
      update: { status: string };
    }): Promise<{ id: string }>;
  };
  toolApiKey: {
    create(args: {
      data: {
        workspaceId: string;
        toolAgentId: string;
        hashedSecret: string;
        prefix: string;
        scopes: string[];
      };
    }): Promise<unknown>;
  };
}

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

export function prismaProvision(prisma: PrismaLike) {
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

    return { workspaceId: workspace.id, agentId: agent.id, apiKey: full };
  };
}

import { ProvisionContext } from '@agentpi/shared';
import {
  HttpSignatureProvisionResult,
} from './config';

/* ─── Prisma shape for HTTP signature provisioning ─── */

interface PrismaHttpSignatureLike {
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
      create: { workspaceId: string; agentpiAgentId: string; status: string; authMode?: string; keyId?: string };
      update: { status: string; authMode?: string; keyId?: string };
    }): Promise<{ id: string }>;
  };
}

export function prismaHttpSignatureProvision(prisma: PrismaHttpSignatureLike) {
  return async (ctx: ProvisionContext): Promise<HttpSignatureProvisionResult> => {
    const workspace = await prisma.workspace.upsert({
      where: { orgId: ctx.orgId },
      create: { orgId: ctx.orgId, name: ctx.workspace.name, planId: 'free' },
      update: { name: ctx.workspace.name },
    });

    const keyId = `${ctx.agentId}@${workspace.id}`;

    await prisma.toolAgent.upsert({
      where: {
        workspaceId_agentpiAgentId: {
          workspaceId: workspace.id,
          agentpiAgentId: ctx.agentId,
        },
      },
      create: {
        workspaceId: workspace.id,
        agentpiAgentId: ctx.agentId,
        status: 'active',
        authMode: 'http_signature',
        keyId,
      },
      update: {
        status: 'active',
        authMode: 'http_signature',
        keyId,
      },
    });

    return {
      workspaceId: workspace.id,
      agentId: ctx.agentId,
      type: 'http_signature',
      keyId,
      algorithm: 'ed25519',
    };
  };
}

export const prismaSignatureProvision = prismaHttpSignatureProvision;

// Backward-compatible export name; now provisions http_signature credentials.
export const prismaProvision = prismaHttpSignatureProvision;

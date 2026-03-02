import { randomBytes, createHash } from 'crypto';
import { ProvisionContext } from '@agentpi/shared';
import {
  ProvisionResult,
  ApiKeyProvisionResult,
  HttpSignatureProvisionResult,
} from './config';

/* ─── Prisma shape for API key provisioning ─── */

interface PrismaApiKeyLike {
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
    updateMany(args: {
      where: { toolAgentId: string; revokedAt: null };
      data: { revokedAt: Date };
    }): Promise<unknown>;
  };
}

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

export function prismaProvision(prisma: PrismaApiKeyLike) {
  return async (ctx: ProvisionContext): Promise<ApiKeyProvisionResult> => {
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

    await prisma.toolApiKey.updateMany({
      where: { toolAgentId: agent.id, revokedAt: null },
      data: { revokedAt: new Date() },
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

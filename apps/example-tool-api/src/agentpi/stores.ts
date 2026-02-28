import { JtiStore, IdempotencyStore, IdempotencyEntry } from '@agentpi/sdk';
import { PrismaService } from '../prisma/prisma.service';

export class PrismaJtiStore implements JtiStore {
  constructor(private readonly prisma: PrismaService) {}

  async has(jti: string): Promise<boolean> {
    const record = await this.prisma.usedJti.findUnique({ where: { jti } });
    return record !== null;
  }

  async add(jti: string, expiresAt: Date): Promise<void> {
    try {
      await this.prisma.usedJti.create({ data: { jti, expiresAt } });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new Error('JTI already used');
      }
      throw error;
    }
  }
}

export class PrismaIdempotencyStore implements IdempotencyStore {
  constructor(private readonly prisma: PrismaService) {}

  async get(
    key: string,
    orgId: string,
    toolId: string,
  ): Promise<IdempotencyEntry | null> {
    const record = await this.prisma.idempotency.findUnique({
      where: { key_orgId_toolId: { key, orgId, toolId } },
    });
    if (!record) return null;
    if (record.expiresAt < new Date()) return null;
    return {
      requestHash: record.requestHash,
      responseJson: record.responseJson,
      expiresAt: record.expiresAt,
    };
  }

  async set(
    key: string,
    orgId: string,
    toolId: string,
    entry: IdempotencyEntry,
  ): Promise<void> {
    await this.prisma.idempotency.upsert({
      where: { key_orgId_toolId: { key, orgId, toolId } },
      create: {
        key,
        orgId,
        toolId,
        requestHash: entry.requestHash,
        responseJson: entry.responseJson,
        expiresAt: entry.expiresAt,
      },
      update: {
        requestHash: entry.requestHash,
        responseJson: entry.responseJson,
        expiresAt: entry.expiresAt,
      },
    });
  }
}

import { JtiStore, IdempotencyStore, IdempotencyEntry } from './config';

export class MemoryJtiStore implements JtiStore {
  private used = new Map<string, number>();

  async has(jti: string): Promise<boolean> {
    const exp = this.used.get(jti);
    if (!exp) return false;
    if (Date.now() > exp) {
      this.used.delete(jti);
      return false;
    }
    return true;
  }

  async add(jti: string, expiresAt: Date): Promise<void> {
    const existing = this.used.get(jti);
    if (existing !== undefined && Date.now() <= existing) {
      throw new Error('JTI already used');
    }
    this.used.set(jti, expiresAt.getTime());
  }
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private entries = new Map<string, IdempotencyEntry>();

  private key(k: string, orgId: string, toolId: string) {
    return `${k}:${orgId}:${toolId}`;
  }

  async get(key: string, orgId: string, toolId: string): Promise<IdempotencyEntry | null> {
    const entry = this.entries.get(this.key(key, orgId, toolId));
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.entries.delete(this.key(key, orgId, toolId));
      return null;
    }
    return entry;
  }

  async set(key: string, orgId: string, toolId: string, entry: IdempotencyEntry): Promise<void> {
    this.entries.set(this.key(key, orgId, toolId), entry);
  }
}

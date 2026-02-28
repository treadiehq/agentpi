import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as jose from 'jose';
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve } from 'path';

@Injectable()
export class KeysService implements OnModuleInit {
  private readonly logger = new Logger(KeysService.name);
  private privateKey!: jose.KeyLike;
  private publicJwk!: jose.JWK;
  private kid!: string;

  async onModuleInit() {
    const keysDir = resolve(
      __dirname,
      '../../../../',
      process.env.AGENTPI_KEYS_DIR || '.keys',
    );

    if (!existsSync(keysDir)) await mkdir(keysDir, { recursive: true });

    const privPath = resolve(keysDir, 'private.json');
    const pubPath = resolve(keysDir, 'public.json');

    const privExists = existsSync(privPath);
    const pubExists = existsSync(pubPath);

    if (privExists && pubExists) {
      const privJson = JSON.parse(await readFile(privPath, 'utf-8'));
      const pubJson = JSON.parse(await readFile(pubPath, 'utf-8'));
      this.privateKey = (await jose.importJWK(privJson, 'RS256')) as jose.KeyLike;
      this.publicJwk = pubJson;
      this.kid = pubJson.kid;
      this.logger.log(`Loaded existing keypair (kid: ${this.kid})`);
    } else if (privExists || pubExists) {
      this.logger.error(
        `Partial key state detected (private=${privExists}, public=${pubExists}). ` +
          'This indicates a previous write failure. ' +
          'Refusing to start to prevent accidental key rotation.',
      );
      throw new Error(
        'Partial key state detected — manual intervention required. ' +
          'Remove the incomplete key file or restore the missing one, then restart.',
      );
    } else {
      const { publicKey, privateKey } = await jose.generateKeyPair('RS256', {
        extractable: true,
      });
      this.privateKey = privateKey;
      const privJwk = await jose.exportJWK(privateKey);
      const pubJwk = await jose.exportJWK(publicKey);
      this.kid = (await jose.calculateJwkThumbprint(pubJwk)).slice(0, 8);
      privJwk.kid = this.kid;
      pubJwk.kid = this.kid;
      pubJwk.use = 'sig';
      pubJwk.alg = 'RS256';
      this.publicJwk = pubJwk;

      const privTmpPath = `${privPath}.tmp`;
      const pubTmpPath = `${pubPath}.tmp`;
      await writeFile(privTmpPath, JSON.stringify(privJwk, null, 2));
      await writeFile(pubTmpPath, JSON.stringify(pubJwk, null, 2));
      await rename(privTmpPath, privPath);
      await rename(pubTmpPath, pubPath);

      this.logger.log(`Generated new keypair (kid: ${this.kid})`);
    }
  }

  getPublicJwks(): { keys: jose.JWK[] } {
    return { keys: [this.publicJwk] };
  }

  async signGrant(payload: Record<string, unknown>, expiresIn: number): Promise<string> {
    return new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256', kid: this.kid })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.privateKey);
  }
}

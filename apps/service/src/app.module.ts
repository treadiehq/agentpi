import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { KeysModule } from './keys/keys.module';
import { GrantsModule } from './grants/grants.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        // Global HTTP-layer rate limit: max 60 requests per minute per IP.
        // This fires before any authentication logic, preventing unauthenticated
        // DoS against the signature verification and admin key check paths.
        ttl: 60_000,
        limit: 60,
      },
    ]),
    KeysModule,
    GrantsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

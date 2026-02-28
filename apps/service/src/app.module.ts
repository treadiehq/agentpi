import { Module } from '@nestjs/common';
import { KeysModule } from './keys/keys.module';
import { GrantsModule } from './grants/grants.module';

@Module({
  imports: [KeysModule, GrantsModule],
})
export class AppModule {}

import { Module, Global } from '@nestjs/common';
import { KeysService } from './keys.service';
import { JwksController } from './jwks.controller';

@Global()
@Module({
  providers: [KeysService],
  controllers: [JwksController],
  exports: [KeysService],
})
export class KeysModule {}

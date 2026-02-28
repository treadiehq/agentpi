import { Module } from '@nestjs/common';
import { ConnectController } from './agentpi.controller';

@Module({
  controllers: [ConnectController],
})
export class ConnectModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ConnectModule } from './agentpi/agentpi.module';
import { ToolModule } from './tool/tool.module';

@Module({
  imports: [PrismaModule, ConnectModule, ToolModule],
})
export class AppModule {}

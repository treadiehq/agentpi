import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(__dirname, '../../../.env') });

async function bootstrap() {
  try {
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
    );
    const port = process.env.TOOL_PORT || 4020;
    await app.listen(port, '0.0.0.0');
    console.log(`Example Tool API listening on :${port}`);
  } catch (error) {
    console.error('Failed to start Example Tool API:', error);
    process.exit(1);
  }
}
bootstrap();

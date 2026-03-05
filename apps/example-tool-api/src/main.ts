import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
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

    // Strip unknown properties and validate DTO shapes at the HTTP boundary.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    // This tool API is consumed by agents — not a browser-facing app.
    // CORS is explicitly disabled. Enable and allowlist origins if a web UI is added.
    app.enableCors({ origin: false });

    const port = process.env.TOOL_PORT || 4020;
    await app.listen(port, '0.0.0.0');
    console.log(`Example Tool API listening on :${port}`);
  } catch (error) {
    console.error('Failed to start Example Tool API:', error);
    process.exit(1);
  }
}
bootstrap();

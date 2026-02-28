import {
  Controller,
  Get,
  Post,
  Headers,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class ToolController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('hello')
  hello() {
    return { message: 'Hello from Example Tool API!' };
  }

  @Post('deploy')
  async deploy(@Headers('authorization') auth: string) {
    if (!auth?.startsWith('Bearer ')) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Missing Bearer token' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const apiKey = auth.slice(7);
    const parts = apiKey.split('_');
    // format: tk_live_<8hex>_<secret>
    if (parts.length < 4) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Invalid API key format' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const prefix = parts.slice(0, 3).join('_');
    const secret = parts.slice(3).join('_');
    const hashedSecret = createHash('sha256').update(secret).digest('hex');

    const key = await this.prisma.toolApiKey.findFirst({
      where: {
        prefix,
        hashedSecret,
        revokedAt: null,
      },
    });

    if (!key) {
      throw new HttpException(
        { error: { code: 'unauthorized', message: 'Invalid API key' } },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (!key.scopes.includes('deploy')) {
      throw new HttpException(
        { error: { code: 'forbidden', message: 'Missing deploy scope' } },
        HttpStatus.FORBIDDEN,
      );
    }

    await this.prisma.toolApiKey.update({
      where: { id: key.id },
      data: { lastUsedAt: new Date() },
    });

    return {
      deployed: true,
      message: 'Deployment successful!',
      workspace_id: key.workspaceId,
      timestamp: new Date().toISOString(),
    };
  }
}

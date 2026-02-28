import { Controller, Get } from '@nestjs/common';
import { KeysService } from './keys.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: KeysService) {}

  @Get('jwks.json')
  getJwks() {
    return this.keys.getPublicJwks();
  }
}

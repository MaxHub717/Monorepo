import { Controller, Get } from '@nestjs/common';
import { Public } from '../authz/authz.decorators.js';

@Controller('health')
@Public()
export class HealthController {
  @Get()
  getHealth() {
    return { ok: true, service: 'nexgen-api' };
  }
}

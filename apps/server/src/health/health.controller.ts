import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/roles.decorator.js';
import { HealthService } from './health.service.js';

@Controller('health')
@Public()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    return this.health.check();
  }
}

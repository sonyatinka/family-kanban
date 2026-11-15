import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@family/shared';
import { Public } from '../auth/auth.decorators';
import { HealthService } from './health.service';

// Public: load balancers and monitoring call the health check, and they have no token
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // GET /api/health
  @Get()
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}

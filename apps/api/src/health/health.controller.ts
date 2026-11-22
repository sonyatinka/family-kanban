import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { healthResponseSchema, type HealthResponse } from '@family/shared';
import { Public } from '../auth/auth.decorators';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { HealthService } from './health.service';

// Public: load balancers and monitoring call the health check, and they have no token
@ApiTags('health')
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  // GET /api/health
  @Get()
  @ApiDoc({
    summary: 'Postgres and Redis status',
    description: 'Always 200: a service that is down shows as "down", and status as "degraded".',
    status: 200,
    returns: healthResponseSchema,
  })
  check(): Promise<HealthResponse> {
    return this.health.check();
  }
}

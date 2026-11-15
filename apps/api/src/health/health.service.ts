import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import type { HealthResponse, ServiceStatus } from '@family/shared';
import { DB, type Database } from '../db/db.module';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly redis: Redis;

  // Postgres comes through DI from DbModule, which owns the connection pool
  constructor(
    @Inject(DB) private readonly db: Database,
    config: ConfigService,
  ) {
    this.redis = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.checkPostgres(), this.checkRedis()]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database, redis },
    };
  }

  private async checkPostgres(): Promise<ServiceStatus> {
    try {
      await this.db.execute(sql`SELECT 1`);
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<ServiceStatus> {
    try {
      if (this.redis.status === 'wait') await this.redis.connect();
      return (await this.redis.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }

  onModuleDestroy() {
    this.redis.disconnect();
  }
}

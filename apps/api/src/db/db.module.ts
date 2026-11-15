import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// DI tokens: Pool and Drizzle have no wrapper class, so we inject them by a string key
export const PG_POOL = 'PG_POOL';
export const DB = 'DB';

export type Database = NodePgDatabase<typeof schema>;

// Global: imported once in AppModule, and DB is available in every feature module
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({ connectionString: config.getOrThrow<string>('DATABASE_URL') }),
    },
    {
      provide: DB,
      inject: [PG_POOL],
      // Pass the schema so the relational API works: db.query.users.findFirst(...)
      useFactory: (pool: Pool): Database => drizzle(pool, { schema }),
    },
  ],
  exports: [DB],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // Close the connections when the app stops (enableShutdownHooks in main.ts).
  // onApplicationShutdown rather than onModuleDestroy: it runs after the HTTP server
  // has stopped accepting requests, so no request can hit a closed pool
  async onApplicationShutdown() {
    await this.pool.end();
  }
}

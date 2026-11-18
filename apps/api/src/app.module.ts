import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { DbModule } from './db/db.module';
import { FamiliesModule } from './families/families.module';
import { HealthModule } from './health/health.module';
import { InvitesModule } from './invites/invites.module';

@Module({
  imports: [
    // Reads .env from the monorepo root
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['../../.env', '.env'] }),
    DbModule,
    HealthModule,
    AuthModule,
    FamiliesModule,
    InvitesModule,
    BoardsModule,
  ],
})
export class AppModule {}

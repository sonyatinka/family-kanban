import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  controllers: [FamiliesController],
  providers: [FamiliesService],
  // The invites module checks roles and returns the joined family through this service
  exports: [FamiliesService],
})
export class FamiliesModule {}

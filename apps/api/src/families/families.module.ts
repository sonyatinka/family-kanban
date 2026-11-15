import { Module } from '@nestjs/common';
import { FamiliesController } from './families.controller';
import { FamiliesService } from './families.service';

@Module({
  controllers: [FamiliesController],
  providers: [FamiliesService],
  // Step 5 (invites) will add members through this service
  exports: [FamiliesService],
})
export class FamiliesModule {}

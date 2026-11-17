import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { FamilyInvitesController, InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  // FamiliesService: the caller's role and the family returned after joining
  imports: [FamiliesModule],
  controllers: [FamilyInvitesController, InvitesController],
  providers: [InvitesService],
})
export class InvitesModule {}

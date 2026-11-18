import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { BoardsController, FamilyBoardsController } from './boards.controller';
import { BoardsService } from './boards.service';

@Module({
  // FamiliesService: is the caller a member of the family
  imports: [FamiliesModule],
  controllers: [FamilyBoardsController, BoardsController],
  providers: [BoardsService],
})
export class BoardsModule {}

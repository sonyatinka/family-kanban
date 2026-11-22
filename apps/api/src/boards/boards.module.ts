import { Module } from '@nestjs/common';
import { FamiliesModule } from '../families/families.module';
import { BoardAccess } from './board-access';
import { BoardsController, FamilyBoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { CardsController, ColumnCardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { BoardColumnsController, ColumnsController } from './columns.controller';
import { ColumnsService } from './columns.service';

// Boards with their columns and cards: one feature, sharing the access checks (BoardAccess)
@Module({
  // FamiliesService: is the caller (or the assignee) a member of the family
  imports: [FamiliesModule],
  controllers: [
    FamilyBoardsController,
    BoardsController,
    BoardColumnsController,
    ColumnsController,
    ColumnCardsController,
    CardsController,
  ],
  providers: [BoardAccess, BoardsService, ColumnsService, CardsService],
})
export class BoardsModule {}

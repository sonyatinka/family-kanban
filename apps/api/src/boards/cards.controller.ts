import { Body, Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createCardSchema,
  moveCardSchema,
  updateCardSchema,
  type CardInfo,
  type CreateCardRequest,
  type MoveCardRequest,
  type UpdateCardRequest,
} from '@family/shared';
import { CurrentUser, type AuthUser } from '../auth/auth.decorators';
import { uuidParam } from '../common/uuid-param';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CardsService } from './cards.service';

// Adding a card to a column
@Controller('columns/:columnId/cards')
export class ColumnCardsController {
  constructor(private readonly cards: CardsService) {}

  // POST /api/columns/:columnId/cards → 201, the new card at the end of the column
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @Body(new ZodValidationPipe(createCardSchema)) body: CreateCardRequest,
  ): Promise<CardInfo> {
    return this.cards.create(columnId, user.id, body);
  }
}

// One card, addressed by its own id (the service checks the board's family)
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  // PATCH /api/cards/:cardId → the card; only the sent fields change, null clears a field
  @Patch(':cardId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
    @Body(new ZodValidationPipe(updateCardSchema)) body: UpdateCardRequest,
  ): Promise<CardInfo> {
    return this.cards.update(cardId, user.id, body);
  }

  // POST /api/cards/:cardId/move → 200, the card in its new column and position
  @Post(':cardId/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
    @Body(new ZodValidationPipe(moveCardSchema)) body: MoveCardRequest,
  ): Promise<CardInfo> {
    return this.cards.move(cardId, user.id, body);
  }

  // DELETE /api/cards/:cardId → 204
  @Delete(':cardId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
  ): Promise<void> {
    return this.cards.remove(cardId, user.id);
  }
}

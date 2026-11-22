import { Controller, Delete, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  cardInfoSchema,
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
import { ZodBody } from '../common/zod-body.decorator';
import { ApiDoc } from '../swagger/api-doc.decorator';
import { CardsService } from './cards.service';

// Adding a card to a column
@ApiTags('cards')
@Controller('columns/:columnId/cards')
export class ColumnCardsController {
  constructor(private readonly cards: CardsService) {}

  // POST /api/columns/:columnId/cards → 201, the new card at the end of the column
  @Post()
  @ApiDoc({
    summary: 'Add a card at the end of the column',
    status: 201,
    returns: cardInfoSchema,
    errors: {
      400: 'Invalid column id or fields; the assignee is not in the family (errors.assigneeId)',
      404: 'No such column, or I am not in its family',
      409: 'The board is changing right now (three attempts failed), try again',
    },
  })
  create(
    @CurrentUser() user: AuthUser,
    @Param('columnId', uuidParam('Invalid column id')) columnId: string,
    @ZodBody(createCardSchema) body: CreateCardRequest,
  ): Promise<CardInfo> {
    return this.cards.create(columnId, user.id, body);
  }
}

// One card, addressed by its own id (the service checks the board's family)
@ApiTags('cards')
@Controller('cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  // PATCH /api/cards/:cardId → the card; only the sent fields change, null clears a field
  @Patch(':cardId')
  @ApiDoc({
    summary: 'Change a card',
    description:
      'Only the sent fields change; null clears assigneeId or dueDate; an empty body changes nothing.',
    status: 200,
    returns: cardInfoSchema,
    errors: {
      400: 'Invalid card id or fields; the assignee is not in the family (errors.assigneeId)',
      404: 'No such card, or I am not in its family',
    },
  })
  update(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
    @ZodBody(updateCardSchema) body: UpdateCardRequest,
  ): Promise<CardInfo> {
    return this.cards.update(cardId, user.id, body);
  }

  // POST /api/cards/:cardId/move → 200, the card in its new column and position
  @Post(':cardId/move')
  @HttpCode(200)
  @ApiDoc({
    summary: 'Move a card into a column, after another card or first',
    description: 'The server computes the new position key; the client only says where.',
    status: 200,
    returns: cardInfoSchema,
    errors: {
      400: 'Invalid id, or the card is placed after itself',
      404: 'No such card, or the column is not on the same board',
      409: 'afterCardId is not in the target column (reload the board), or the board is busy',
    },
  })
  move(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
    @ZodBody(moveCardSchema) body: MoveCardRequest,
  ): Promise<CardInfo> {
    return this.cards.move(cardId, user.id, body);
  }

  // DELETE /api/cards/:cardId → 204
  @Delete(':cardId')
  @HttpCode(204)
  @ApiDoc({
    summary: 'Delete a card',
    status: 204,
    errors: { 400: 'Invalid card id', 404: 'No such card, or I am not in its family' },
  })
  remove(
    @CurrentUser() user: AuthUser,
    @Param('cardId', uuidParam('Invalid card id')) cardId: string,
  ): Promise<void> {
    return this.cards.remove(cardId, user.id);
  }
}

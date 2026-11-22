import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, ne } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type {
  CardInfo,
  CreateCardRequest,
  MoveCardRequest,
  UpdateCardRequest,
  ValidationErrorResponse,
} from '@family/shared';
import { DB, type Database } from '../db/db.module';
import { cards } from '../db/schema';
import { FamiliesService } from '../families/families.service';
import { BoardAccess } from './board-access';
import { toCardInfo } from './mappers';
import {
  CARD_COLUMN_FK,
  CARD_POSITION_UNIQUE,
  notFoundOnForeignKey,
  withPositionRetry,
} from './positions';

@Injectable()
export class CardsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: BoardAccess,
    private readonly families: FamiliesService,
  ) {}

  // A new card goes to the end of the column
  async create(columnId: string, userId: string, data: CreateCardRequest): Promise<CardInfo> {
    const column = await this.access.column(columnId, userId);
    await this.requireAssignee(column.familyId, data.assigneeId);
    try {
      return await withPositionRetry(CARD_POSITION_UNIQUE, async () => {
        const [last] = await this.db
          .select({ position: cards.position })
          .from(cards)
          .where(eq(cards.columnId, columnId))
          .orderBy(desc(cards.position))
          .limit(1);
        const [card] = await this.db
          .insert(cards)
          .values({
            columnId,
            title: data.title,
            description: data.description,
            assigneeId: data.assigneeId,
            dueDate: data.dueDate,
            position: generateKeyBetween(last?.position ?? null, null),
            createdBy: userId,
          })
          .returning();
        return toCardInfo(card);
      });
    } catch (err) {
      throw notFoundOnForeignKey(err, CARD_COLUMN_FK, 'Column not found');
    }
  }

  // Changes only the fields that were sent. An empty body changes nothing
  async update(cardId: string, userId: string, data: UpdateCardRequest): Promise<CardInfo> {
    const card = await this.access.card(cardId, userId);
    if (Object.values(data).every((v) => v === undefined)) return toCardInfo(card);
    if (data.assigneeId !== undefined) await this.requireAssignee(card.familyId, data.assigneeId);

    // Drizzle leaves out keys whose value is undefined; null sets NULL
    const [updated] = await this.db
      .update(cards)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(cards.id, cardId))
      .returning();
    if (!updated) throw new NotFoundException('Card not found');
    return toCardInfo(updated);
  }

  async remove(cardId: string, userId: string): Promise<void> {
    await this.access.card(cardId, userId);
    await this.db.delete(cards).where(eq(cards.id, cardId));
  }

  // Puts the card into a column of the same board, after another card or first (afterCardId
  // null). The key goes between that card and the next one, read now, so a card someone else
  // has put there in the meantime is taken into account
  async move(cardId: string, userId: string, data: MoveCardRequest): Promise<CardInfo> {
    // Two independent lookups, in parallel: one round trip to the database instead of two
    const [card, target] = await Promise.all([
      this.access.card(cardId, userId),
      this.access.column(data.columnId, userId),
    ]);
    // Moving between boards isn't a feature: a column of another board is "not found" here
    if (target.boardId !== card.boardId) throw new NotFoundException('Column not found');
    const { afterCardId } = data;
    if (afterCardId === cardId)
      throw new BadRequestException("A card can't be placed after itself");

    try {
      return await withPositionRetry(CARD_POSITION_UNIQUE, async () => {
        let after: string | null = null;
        if (afterCardId) {
          const [row] = await this.db
            .select({ position: cards.position })
            .from(cards)
            .where(and(eq(cards.id, afterCardId), eq(cards.columnId, target.id)));
          // Moved or deleted meanwhile: the client's picture of the board is stale
          if (!row) throw new ConflictException('The board has changed, reload it');
          after = row.position;
        }
        // The next card after that place, not counting the card being moved
        const [next] = await this.db
          .select({ position: cards.position })
          .from(cards)
          .where(
            and(
              eq(cards.columnId, target.id),
              ne(cards.id, cardId),
              after === null ? undefined : gt(cards.position, after),
            ),
          )
          .orderBy(asc(cards.position))
          .limit(1);

        const [moved] = await this.db
          .update(cards)
          .set({
            columnId: target.id,
            position: generateKeyBetween(after, next?.position ?? null),
            updatedAt: new Date(),
          })
          .where(eq(cards.id, cardId))
          .returning();
        if (!moved) throw new NotFoundException('Card not found');
        return toCardInfo(moved);
      });
    } catch (err) {
      throw notFoundOnForeignKey(err, CARD_COLUMN_FK, 'Column not found');
    }
  }

  // The assignee must be a member of the board's family. The error has the same shape as a
  // validation error, so the card form shows it under the assignee field.
  // Stage 3: leaving a family must also clear the person's assignments
  private async requireAssignee(familyId: string, assigneeId: string | null): Promise<void> {
    if (assigneeId === null) return;
    if (await this.families.getRole(familyId, assigneeId)) return;
    const body: ValidationErrorResponse = {
      statusCode: 400,
      message: 'Validation failed',
      errors: { assigneeId: ['Choose a member of this family'] },
    };
    throw new BadRequestException(body);
  }
}

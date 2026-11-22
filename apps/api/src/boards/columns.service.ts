import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, gt, ne } from 'drizzle-orm';
import { generateKeyBetween } from 'fractional-indexing';
import type { ColumnNameRequest, ColumnSummary, MoveColumnRequest } from '@family/shared';
import { DB, type Database } from '../db/db.module';
import { boardColumns, cards } from '../db/schema';
import { BoardAccess } from './board-access';
import { toColumnSummary } from './mappers';
import {
  COLUMN_BOARD_FK,
  COLUMN_POSITION_UNIQUE,
  notFoundOnForeignKey,
  withPositionRetry,
} from './positions';

@Injectable()
export class ColumnsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly access: BoardAccess,
  ) {}

  // A new column goes to the end of the board
  async create(boardId: string, userId: string, data: ColumnNameRequest): Promise<ColumnSummary> {
    await this.access.board(boardId, userId);
    try {
      return await withPositionRetry(COLUMN_POSITION_UNIQUE, async () => {
        const [last] = await this.db
          .select({ position: boardColumns.position })
          .from(boardColumns)
          .where(eq(boardColumns.boardId, boardId))
          .orderBy(desc(boardColumns.position))
          .limit(1);
        const [column] = await this.db
          .insert(boardColumns)
          .values({
            boardId,
            name: data.name,
            position: generateKeyBetween(last?.position ?? null, null),
          })
          .returning();
        return toColumnSummary(column);
      });
    } catch (err) {
      throw notFoundOnForeignKey(err, COLUMN_BOARD_FK, 'Board not found');
    }
  }

  async rename(columnId: string, userId: string, data: ColumnNameRequest): Promise<ColumnSummary> {
    await this.access.column(columnId, userId);
    const [column] = await this.db
      .update(boardColumns)
      .set({ name: data.name })
      .where(eq(boardColumns.id, columnId))
      .returning();
    if (!column) throw new NotFoundException('Column not found');
    return toColumnSummary(column);
  }

  // Puts the column after another column of the same board, or first (afterColumnId null)
  async move(columnId: string, userId: string, data: MoveColumnRequest): Promise<ColumnSummary> {
    const column = await this.access.column(columnId, userId);
    const { afterColumnId } = data;
    if (afterColumnId === columnId) {
      throw new BadRequestException("A column can't be placed after itself");
    }

    return withPositionRetry(COLUMN_POSITION_UNIQUE, async () => {
      let after: string | null = null;
      if (afterColumnId) {
        const [row] = await this.db
          .select({ position: boardColumns.position })
          .from(boardColumns)
          .where(and(eq(boardColumns.id, afterColumnId), eq(boardColumns.boardId, column.boardId)));
        // Deleted meanwhile, or never on this board: the client's picture of the board is stale
        if (!row) throw new ConflictException('The board has changed, reload it');
        after = row.position;
      }
      // The next column after that place, not counting the column being moved
      const [next] = await this.db
        .select({ position: boardColumns.position })
        .from(boardColumns)
        .where(
          and(
            eq(boardColumns.boardId, column.boardId),
            ne(boardColumns.id, columnId),
            after === null ? undefined : gt(boardColumns.position, after),
          ),
        )
        .orderBy(asc(boardColumns.position))
        .limit(1);

      const [moved] = await this.db
        .update(boardColumns)
        .set({ position: generateKeyBetween(after, next?.position ?? null) })
        .where(eq(boardColumns.id, columnId))
        .returning();
      if (!moved) throw new NotFoundException('Column not found');
      return toColumnSummary(moved);
    });
  }

  // Only an empty column can be deleted, so cards are never lost by accident (409 otherwise).
  // Counting the cards and then deleting would leave a gap: a card added in between would be
  // deleted by the cascade. So the column row is locked first (FOR UPDATE). Adding a card
  // checks the foreign key and takes a FOR KEY SHARE lock on the same row, which conflicts with
  // FOR UPDATE, so one of the two waits for the other:
  // - the card insert came first: the count below sees the new card, the answer is 409;
  // - the delete came first: the waiting insert finds no column and fails (the API answers 404).
  async remove(columnId: string, userId: string): Promise<void> {
    await this.access.column(columnId, userId);
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({ id: boardColumns.id })
        .from(boardColumns)
        .where(eq(boardColumns.id, columnId))
        .for('update');
      if (!locked) throw new NotFoundException('Column not found');

      // In READ COMMITTED each statement sees everything committed before it started, so this
      // runs after the lock wait and sees a card committed while we were waiting
      const [card] = await tx
        .select({ id: cards.id })
        .from(cards)
        .where(eq(cards.columnId, columnId))
        .limit(1);
      if (card) throw new ConflictException('Move or delete the cards first');

      await tx.delete(boardColumns).where(eq(boardColumns.id, columnId));
    });
  }
}

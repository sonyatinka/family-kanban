import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import type { BoardDetails, BoardNameRequest, BoardSummary, CardInfo } from '@family/shared';
import { DB, type Database } from '../db/db.module';
import { boardColumns, boards, cards } from '../db/schema';
import { FamiliesService } from '../families/families.service';
import { BoardAccess } from './board-access';
import { toBoardSummary, toCardInfo, toColumnSummary } from './mappers';

// Every new board starts with these columns; they can be renamed and deleted later
const DEFAULT_COLUMNS = ['To do', 'In progress', 'Done'];

@Injectable()
export class BoardsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly families: FamiliesService,
    private readonly access: BoardAccess,
  ) {}

  // A board with the default columns. Any member of the family may create one; role-based
  // permissions come in stage 3
  async create(familyId: string, userId: string, data: BoardNameRequest): Promise<BoardDetails> {
    await this.requireMember(familyId, userId);

    // The board and its columns in one transaction: no board without columns is left behind
    const boardId = await this.db.transaction(async (tx) => {
      const [board] = await tx
        .insert(boards)
        .values({ familyId, name: data.name })
        .returning({ id: boards.id });
      // ["a0", "a1", "a2"]: evenly spaced keys, so new columns fit in anywhere
      const keys = generateNKeysBetween(null, null, DEFAULT_COLUMNS.length);
      await tx
        .insert(boardColumns)
        .values(DEFAULT_COLUMNS.map((name, i) => ({ boardId: board.id, name, position: keys[i] })));
      return board.id;
    });
    return this.get(boardId, userId);
  }

  // The family's boards, oldest first
  async list(familyId: string, userId: string): Promise<BoardSummary[]> {
    await this.requireMember(familyId, userId);
    const rows = await this.db
      .select()
      .from(boards)
      .where(eq(boards.familyId, familyId))
      .orderBy(asc(boards.createdAt));
    return rows.map(toBoardSummary);
  }

  // A board with its columns and cards, both sorted by position
  async get(boardId: string, userId: string): Promise<BoardDetails> {
    const board = await this.access.board(boardId, userId);

    // Columns and cards are read in one REPEATABLE READ transaction, so both queries see the
    // database at the same moment. In READ COMMITTED (the default) each query has its own
    // snapshot: a column created and a card moved into it between the two queries would give
    // a card whose column isn't in the list, and the card would silently drop out of the answer
    const { columns, cardRows } = await this.db.transaction(
      async (tx) => {
        const columns = await tx
          .select()
          .from(boardColumns)
          .where(eq(boardColumns.boardId, boardId))
          .orderBy(asc(boardColumns.position));
        // All cards of the board in one query (through their columns), not one per column
        const cardRows = await tx
          .select({ card: cards })
          .from(cards)
          .innerJoin(boardColumns, eq(boardColumns.id, cards.columnId))
          .where(eq(boardColumns.boardId, boardId))
          .orderBy(asc(cards.position));
        return { columns, cardRows };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );

    const cardsByColumn = new Map<string, CardInfo[]>();
    for (const { card } of cardRows) {
      const list = cardsByColumn.get(card.columnId) ?? [];
      list.push(toCardInfo(card));
      cardsByColumn.set(card.columnId, list);
    }

    return {
      ...toBoardSummary(board),
      columns: columns.map((c) => ({
        ...toColumnSummary(c),
        cards: cardsByColumn.get(c.id) ?? [],
      })),
    };
  }

  async rename(boardId: string, userId: string, data: BoardNameRequest): Promise<BoardSummary> {
    await this.access.board(boardId, userId);
    const [board] = await this.db
      .update(boards)
      .set({ name: data.name })
      .where(eq(boards.id, boardId))
      .returning();
    // Deleted by someone else between the check and the update
    if (!board) throw new NotFoundException('Board not found');
    return toBoardSummary(board);
  }

  // Deletes the board with its columns and cards (ON DELETE CASCADE)
  async remove(boardId: string, userId: string): Promise<void> {
    await this.access.board(boardId, userId);
    await this.db.delete(boards).where(eq(boards.id, boardId));
  }

  private async requireMember(familyId: string, userId: string): Promise<void> {
    // Not a member and no such family look the same: 404
    if (!(await this.families.getRole(familyId, userId))) {
      throw new NotFoundException('Family not found');
    }
  }
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { generateNKeysBetween } from 'fractional-indexing';
import type { BoardDetails, BoardNameRequest, BoardSummary, CardInfo } from '@family/shared';
import { DB, type Database } from '../db/db.module';
import { boardColumns, boards, cards, familyMembers } from '../db/schema';
import { FamiliesService } from '../families/families.service';

// Every new board starts with these columns; they can be renamed and deleted later
const DEFAULT_COLUMNS = ['To do', 'In progress', 'Done'];

@Injectable()
export class BoardsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly families: FamiliesService,
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
    const board = await this.findForMember(boardId, userId);

    const columns = await this.db
      .select()
      .from(boardColumns)
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(asc(boardColumns.position));

    // All cards of the board in one query (through their columns), not one query per column
    const cardRows = await this.db
      .select({ card: cards })
      .from(cards)
      .innerJoin(boardColumns, eq(boardColumns.id, cards.columnId))
      .where(eq(boardColumns.boardId, boardId))
      .orderBy(asc(cards.position));

    const cardsByColumn = new Map<string, CardInfo[]>();
    for (const { card } of cardRows) {
      const list = cardsByColumn.get(card.columnId) ?? [];
      list.push(toCardInfo(card));
      cardsByColumn.set(card.columnId, list);
    }

    return {
      ...toBoardSummary(board),
      columns: columns.map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        cards: cardsByColumn.get(c.id) ?? [],
      })),
    };
  }

  async rename(boardId: string, userId: string, data: BoardNameRequest): Promise<BoardSummary> {
    await this.findForMember(boardId, userId);
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
    await this.findForMember(boardId, userId);
    await this.db.delete(boards).where(eq(boards.id, boardId));
  }

  private async requireMember(familyId: string, userId: string): Promise<void> {
    // Not a member and no such family look the same: 404
    if (!(await this.families.getRole(familyId, userId))) {
      throw new NotFoundException('Family not found');
    }
  }

  // The board, if the user is a member of the board's family. One query: the join with
  // family_members finds no row both for a missing board and for someone else's board,
  // so the two get the same 404 and board ids can't be probed
  private async findForMember(boardId: string, userId: string) {
    const [row] = await this.db
      .select({ board: boards })
      .from(boards)
      .innerJoin(
        familyMembers,
        and(eq(familyMembers.familyId, boards.familyId), eq(familyMembers.userId, userId)),
      )
      .where(eq(boards.id, boardId));
    if (!row) throw new NotFoundException('Board not found');
    return row.board;
  }
}

function toBoardSummary(b: typeof boards.$inferSelect): BoardSummary {
  return { id: b.id, familyId: b.familyId, name: b.name, createdAt: b.createdAt.toISOString() };
}

function toCardInfo(c: typeof cards.$inferSelect): CardInfo {
  return {
    id: c.id,
    columnId: c.columnId,
    title: c.title,
    description: c.description,
    assigneeId: c.assigneeId,
    dueDate: c.dueDate,
    position: c.position,
    createdBy: c.createdBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../db/db.module';
import { boardColumns, boards, cards, familyMembers } from '../db/schema';

// Finds a board, a column or a card for a user who is a member of its family. Each lookup is
// one query: the join with family_members finds no row both for a missing item and for
// someone else's, so the two get the same 404 and ids can't be probed. Role checks come in
// stage 3; for now any member may do everything.
@Injectable()
export class BoardAccess {
  constructor(@Inject(DB) private readonly db: Database) {}

  async board(boardId: string, userId: string) {
    const [row] = await this.db
      .select({ board: boards })
      .from(boards)
      .innerJoin(familyMembers, this.member(userId))
      .where(eq(boards.id, boardId));
    if (!row) throw new NotFoundException('Board not found');
    return row.board;
  }

  // The column with its board's family
  async column(columnId: string, userId: string) {
    const [row] = await this.db
      .select({ column: boardColumns, familyId: boards.familyId })
      .from(boardColumns)
      .innerJoin(boards, eq(boards.id, boardColumns.boardId))
      .innerJoin(familyMembers, this.member(userId))
      .where(eq(boardColumns.id, columnId));
    if (!row) throw new NotFoundException('Column not found');
    return { ...row.column, familyId: row.familyId };
  }

  // The card with its board and family: card → column → board → family
  async card(cardId: string, userId: string) {
    const [row] = await this.db
      .select({ card: cards, boardId: boardColumns.boardId, familyId: boards.familyId })
      .from(cards)
      .innerJoin(boardColumns, eq(boardColumns.id, cards.columnId))
      .innerJoin(boards, eq(boards.id, boardColumns.boardId))
      .innerJoin(familyMembers, this.member(userId))
      .where(eq(cards.id, cardId));
    if (!row) throw new NotFoundException('Card not found');
    return { ...row.card, boardId: row.boardId, familyId: row.familyId };
  }

  // The caller's membership in the board's family
  private member(userId: string) {
    return and(eq(familyMembers.familyId, boards.familyId), eq(familyMembers.userId, userId));
  }
}

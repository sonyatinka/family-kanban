import type { BoardSummary, CardInfo, ColumnSummary } from '@family/shared';
import type { Board, BoardColumn, Card } from '../db/schema';

// Database rows → response types. Explicit fields, so a new column never leaks by accident

export function toBoardSummary(b: Board): BoardSummary {
  return { id: b.id, familyId: b.familyId, name: b.name, createdAt: b.createdAt.toISOString() };
}

export function toColumnSummary(c: BoardColumn): ColumnSummary {
  return { id: c.id, boardId: c.boardId, name: c.name, position: c.position };
}

export function toCardInfo(c: Card): CardInfo {
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

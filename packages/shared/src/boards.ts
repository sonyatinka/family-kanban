import { z } from 'zod';

// Creating and renaming a board take the same body
export const boardNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a board name')
    .max(100, 'Board name must be at most 100 characters'),
});

export type BoardNameRequest = z.infer<typeof boardNameSchema>;

// Creating and renaming a column take the same body
export const columnNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Enter a column name')
    .max(50, 'Column name must be at most 50 characters'),
});

export type ColumnNameRequest = z.infer<typeof columnNameSchema>;

// Moving a column: put it after this column, or first (null). The server computes the new key
export const moveColumnSchema = z.object({
  afterColumnId: z.uuid({ error: 'Invalid column id' }).nullable(),
});

export type MoveColumnRequest = z.infer<typeof moveColumnSchema>;

const cardTitle = z
  .string()
  .trim()
  .min(1, 'Enter a title')
  .max(200, 'Title must be at most 200 characters');
const cardDescription = z.string().trim().max(5000, 'Description must be at most 5000 characters');
// A member of the board's family (checked by the server), or null for nobody
const cardAssignee = z.uuid({ error: 'Invalid assignee' }).nullable();
// ISO 8601 calendar day, "2026-11-30": unambiguous and sorts as text in date order.
// The web app shows it in a human format; Zod also rejects days like 2026-02-30
const cardDueDate = z.iso.date({ error: 'Enter a date as YYYY-MM-DD' }).nullable();

export const createCardSchema = z.object({
  title: cardTitle,
  description: cardDescription.default(''),
  assigneeId: cardAssignee.default(null),
  dueDate: cardDueDate.default(null),
});

export type CreateCardRequest = z.infer<typeof createCardSchema>;

// PATCH: only the fields that are sent change; null clears the assignee or the due date.
// An empty body changes nothing
export const updateCardSchema = z.object({
  title: cardTitle.optional(),
  description: cardDescription.optional(),
  assigneeId: cardAssignee.optional(),
  dueDate: cardDueDate.optional(),
});

export type UpdateCardRequest = z.infer<typeof updateCardSchema>;

// Moving a card: into this column (of the same board), after this card or first (null).
// The server computes the new key between that card and the next one
export const moveCardSchema = z.object({
  columnId: z.uuid({ error: 'Invalid column id' }),
  afterCardId: z.uuid({ error: 'Invalid card id' }).nullable(),
});

export type MoveCardRequest = z.infer<typeof moveCardSchema>;

// A board in the family's list of boards
export interface BoardSummary {
  id: string;
  familyId: string;
  name: string;
  createdAt: string;
}

export interface CardInfo {
  id: string;
  columnId: string;
  title: string;
  description: string;
  // A member of the family, or null when nobody is assigned
  assigneeId: string | null;
  // A calendar day, "2026-11-30", without time
  dueDate: string | null;
  // Fractional-indexing key; cards in a column are sorted by it (byte order, as in JS)
  position: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// A column without its cards: the answer to creating, renaming and moving a column
export interface ColumnSummary {
  id: string;
  boardId: string;
  name: string;
  position: string;
}

export interface ColumnInfo extends ColumnSummary {
  // Sorted by position
  cards: CardInfo[];
}

// One board with its columns and cards, everything the board screen needs in one request
export interface BoardDetails extends BoardSummary {
  // Sorted by position
  columns: ColumnInfo[];
}

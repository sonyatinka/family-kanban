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

// Fractional-indexing key; items are sorted by it in byte order, as JavaScript compares strings
const position = z
  .string()
  .describe('Order key: sort by it as plain strings (byte order). Never compute it on the client');

// A board in the family's list of boards
export const boardSummarySchema = z.object({
  id: z.uuid(),
  familyId: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export type BoardSummary = z.infer<typeof boardSummarySchema>;

export const cardInfoSchema = z.object({
  id: z.uuid(),
  columnId: z.uuid(),
  title: z.string(),
  description: z.string(),
  assigneeId: z.uuid().nullable().describe('A member of the family, or null when nobody'),
  dueDate: z.iso.date().nullable().describe('A calendar day without time, "2026-11-30"'),
  position,
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CardInfo = z.infer<typeof cardInfoSchema>;

// A column without its cards: the answer to creating, renaming and moving a column
export const columnSummarySchema = z.object({
  id: z.uuid(),
  boardId: z.uuid(),
  name: z.string(),
  position,
});

export type ColumnSummary = z.infer<typeof columnSummarySchema>;

export const columnInfoSchema = columnSummarySchema.extend({
  cards: z.array(cardInfoSchema).describe('Sorted by position'),
});

export type ColumnInfo = z.infer<typeof columnInfoSchema>;

// One board with its columns and cards, everything the board screen needs in one request
export const boardDetailsSchema = boardSummarySchema.extend({
  columns: z.array(columnInfoSchema).describe('Sorted by position'),
});

export type BoardDetails = z.infer<typeof boardDetailsSchema>;

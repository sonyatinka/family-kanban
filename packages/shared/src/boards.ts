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

export interface ColumnInfo {
  id: string;
  name: string;
  position: string;
  // Sorted by position
  cards: CardInfo[];
}

// One board with its columns and cards, everything the board screen needs in one request
export interface BoardDetails extends BoardSummary {
  // Sorted by position
  columns: ColumnInfo[];
}

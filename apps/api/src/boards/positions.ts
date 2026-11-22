import { ConflictException, NotFoundException } from '@nestjs/common';
import { isForeignKeyViolation, isUniqueViolation } from '../common/pg-errors';

// Unique indexes on the position keys (see schema.ts)
export const COLUMN_POSITION_UNIQUE = 'board_columns_board_id_position_key';
export const CARD_POSITION_UNIQUE = 'cards_column_id_position_key';

// Foreign keys whose violation means "the column or the board was deleted meanwhile"
export const COLUMN_BOARD_FK = 'board_columns_board_id_boards_id_fk';
export const CARD_COLUMN_FK = 'cards_column_id_board_columns_id_fk';

const ATTEMPTS = 3;

// Runs "read the neighbors, compute a key, write" again when the write hits the unique index:
// for the same neighbors the library always returns the same key, so two people adding a card
// to the end of a column at the same moment compute the same one. The second attempt reads
// the neighbors again, now including the card that won, and gets a different key.
export async function withPositionRetry<T>(
  constraint: string,
  write: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await write();
    } catch (err) {
      if (!isUniqueViolation(err, constraint)) throw err;
      if (attempt === ATTEMPTS) {
        throw new ConflictException('The board is changing right now, try again');
      }
    }
  }
}

// A write that lost a race with a delete: the board or the column was deleted between the
// access check and the write (its row lock made the write wait, then the foreign key found no
// row). Returns a 404 for that foreign key, or the original error. Use as `throw notFound…(…)`
export function notFoundOnForeignKey(err: unknown, constraint: string, message: string): unknown {
  return isForeignKeyViolation(err, constraint) ? new NotFoundException(message) : err;
}

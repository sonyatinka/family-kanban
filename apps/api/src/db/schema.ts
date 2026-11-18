import {
  customType,
  date,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// The database schema is the source of truth. drizzle-kit generates SQL migrations from it
// (pnpm db:generate), and Drizzle infers row types for queries.

export const users = pgTable('users', {
  // UUID rather than auto-increment: the id doesn't reveal how many users there are and can't be guessed
  id: uuid('id').primaryKey().defaultRandom(),
  // Stored lowercased (the schema normalizes it); the database enforces uniqueness
  email: text('email').notNull().unique(),
  // Only the argon2 hash, never the password itself
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  // timestamptz: stored in UTC, no time zone confusion
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// Refresh tokens. One row is one login on one device. We store only the token's SHA-256,
// not the token itself, so a leaked table doesn't let anyone log in.
export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Deleting a user deletes the user's tokens
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // UNIQUE also gives an index: every refresh looks the token up by its hash
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Used tokens are marked, not deleted: presenting a revoked token again is a sign
    // of theft (see RefreshTokensService.rotate)
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Index for "revoke all tokens of a user" (log out everywhere, theft response)
  (t) => [index('refresh_tokens_user_id_idx').on(t.userId)],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;

// A person's role in a particular family. Role-based permissions come in stage 3, but the role
// is stored now, on the user-family link: one can be a parent in one family and a guest
// in another.
export const familyRole = pgEnum('family_role', ['parent', 'child', 'guest']);

export const families = pgTable('families', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Family = typeof families.$inferSelect;

// Many-to-many link between users and families: who is in which family, with which role
export const familyMembers = pgTable(
  'family_members',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: familyRole('role').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Composite key: one row per person per family
    primaryKey({ columns: [t.familyId, t.userId] }),
    // A person can be in several families (a grandmother in her children's families, a nanny
    // as a guest). The primary key starts with family_id, so "my families" (WHERE user_id = …)
    // needs its own index
    index('family_members_user_id_idx').on(t.userId),
  ],
);

export type FamilyMember = typeof familyMembers.$inferSelect;

// One-time invite links. As with refresh tokens, only the SHA-256 of the token is stored:
// a leaked table doesn't let anyone join a family. An invite works while it is not used,
// not revoked and not expired; all three are checked in one UPDATE when it is accepted.
export const familyInvites = pgTable(
  'family_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    // UNIQUE also gives an index: accepting and previewing look the invite up by its hash
    tokenHash: text('token_hash').notNull().unique(),
    // The role the invited person gets in the family
    role: familyRole('role').notNull(),
    // Deleting the inviter's account deletes the invites they made: the invited person
    // would see the name of someone who is gone
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // Set when the invite is accepted. used_at alone marks it as used, so the link stays
    // dead even if the account that used it is deleted later (used_by becomes NULL)
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  // For the list of a family's invites
  (t) => [index('family_invites_family_id_idx').on(t.familyId)],
);

export type FamilyInvite = typeof familyInvites.$inferSelect;

// A fractional-indexing key ("a0", "a0V", "a1"): the order of columns on a board and of cards
// in a column. Moving an item gives it a key between its new neighbors, and nobody else is
// renumbered. The keys are compared byte by byte, as JavaScript compares strings. Postgres
// compares text by the database's collation (language rules, where "a" and "A" sort together),
// which can order such keys differently, so these columns use the "C" collation: plain bytes.
// Drizzle has no collation option, hence a custom type.
const positionKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
});

// A family has any number of boards ("Home", "School")
export const boards = pgTable(
  'boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // For the list of a family's boards
  (t) => [index('boards_family_id_idx').on(t.familyId)],
);

export type Board = typeof boards.$inferSelect;

// "board_columns", not "columns": COLUMNS is an SQL keyword, and information_schema already
// has a "columns" view, which makes queries and error messages confusing
export const boardColumns = pgTable(
  'board_columns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => boards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: positionKey('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Unique: two columns with the same key would have no defined order. Two people adding a
  // column at the same moment can compute the same key; the second insert gets 23505 and is
  // retried with a fresh key. The index also serves "the board's columns in order"
  (t) => [uniqueIndex('board_columns_board_id_position_key').on(t.boardId, t.position)],
);

export type BoardColumn = typeof boardColumns.$inferSelect;

// A card belongs to a column; its board is the column's board. There is no board_id on the
// card: a second copy of that link could disagree with the first one.
export const cards = pgTable(
  'cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // CASCADE, so deleting a board deletes its columns and their cards. Deleting a non-empty
    // column on its own is refused by the service (409), under a row lock on the column
    columnId: uuid('column_id')
      .notNull()
      .references(() => boardColumns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    // One person or nobody. The service checks that the assignee is a member of the family.
    // Deleting the account clears the field; leaving the family (stage 3) must clear it too
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    // A calendar day without time and time zone; times and reminders come in stage 5
    dueDate: date('due_date', { mode: 'string' }),
    position: positionKey('position').notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Same reasoning as for columns; also serves "the column's cards in order"
    uniqueIndex('cards_column_id_position_key').on(t.columnId, t.position),
    // A foreign key doesn't create an index in Postgres. Without this one, deleting a user
    // (ON DELETE SET NULL) would scan the whole cards table; later it serves "my tasks"
    index('cards_assignee_id_idx').on(t.assigneeId),
    index('cards_created_by_idx').on(t.createdBy),
  ],
);

export type Card = typeof cards.$inferSelect;

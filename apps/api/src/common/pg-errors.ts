// Postgres error helpers. Drizzle wraps the pg driver error in DrizzleQueryError, with the
// original in cause. Don't log a DrizzleQueryError message: it contains the query parameters.

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

interface PgErrorInfo {
  code?: string;
  // Name of the violated constraint, for example 'users_email_unique'
  constraint?: string;
}

// Walks the cause chain and returns the first error that has a Postgres code
export function pgError(err: unknown): PgErrorInfo {
  for (let e = err; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string') {
      const constraint =
        'constraint' in e && typeof e.constraint === 'string' ? e.constraint : undefined;
      return { code: e.code, constraint };
    }
  }
  return {};
}

// An error with this Postgres code; if a constraint name is given, of that constraint only
function isViolation(err: unknown, code: string, constraint?: string): boolean {
  const info = pgError(err);
  return info.code === code && (constraint === undefined || info.constraint === constraint);
}

// A unique violation
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  return isViolation(err, PG_UNIQUE_VIOLATION, constraint);
}

// A foreign key violation: the referenced row doesn't exist, for example it was just deleted
export function isForeignKeyViolation(err: unknown, constraint?: string): boolean {
  return isViolation(err, PG_FOREIGN_KEY_VIOLATION, constraint);
}

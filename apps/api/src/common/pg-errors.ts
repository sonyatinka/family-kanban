// Postgres error helpers. Drizzle wraps the pg driver error in DrizzleQueryError, with the
// original in cause. Don't log a DrizzleQueryError message: it contains the query parameters.

export const PG_UNIQUE_VIOLATION = '23505';

interface PgErrorInfo {
  code?: string;
  // Name of the violated constraint, for example 'family_members_one_family_per_user'
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

// A unique violation; if a name is given, a violation of that constraint only
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const info = pgError(err);
  return (
    info.code === PG_UNIQUE_VIOLATION &&
    (constraint === undefined || info.constraint === constraint)
  );
}

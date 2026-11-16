import path from 'node:path';
import { Client } from 'pg';
import { TEST_EMAIL_DOMAIN } from './tests/helpers';

// Runs once after all tests. The tests share the development database, so they clean up
// after themselves: every user they created has an email at TEST_EMAIL_DOMAIN, and nothing
// else is touched.
export default async function globalTeardown() {
  // DATABASE_URL lives in the root .env, the same file the API reads
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const emails = `%@${TEST_EMAIL_DOMAIN}`;
    // Families first. Deleting a user removes the membership rows (ON DELETE CASCADE) but
    // not the family itself, which would stay in the table with no members.
    // Only families where every member is a test user: once invites exist, a test user may
    // join a real family, and that family must survive the cleanup.
    await client.query(
      `DELETE FROM families f
       WHERE EXISTS (
         SELECT 1 FROM family_members m JOIN users u ON u.id = m.user_id
         WHERE m.family_id = f.id AND u.email LIKE $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM family_members m JOIN users u ON u.id = m.user_id
         WHERE m.family_id = f.id AND u.email NOT LIKE $1
       )`,
      [emails],
    );
    // The users' refresh tokens go with them (ON DELETE CASCADE)
    await client.query('DELETE FROM users WHERE email LIKE $1', [emails]);
  } finally {
    await client.end();
  }
}

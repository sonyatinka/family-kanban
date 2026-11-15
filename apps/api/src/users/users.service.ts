import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PublicUser } from '@family/shared';
import { DB, type Database } from '../db/db.module';
import { users, type NewUser, type User } from '../db/schema';

// Access to the users table. Knows nothing about passwords or login: that is AuthService's job.
@Injectable()
export class UsersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.email, email) });
  }

  async findById(id: string): Promise<User | undefined> {
    return this.db.query.users.findFirst({ where: eq(users.id, id) });
  }

  // If the email is taken, the database rejects the insert (UNIQUE) and the error goes to the caller
  async create(data: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }
}

// List the response fields explicitly, so a new column in the table can't leak into the API
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

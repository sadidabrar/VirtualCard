import { eq, or } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { users, cards, type User, type NewUser, type NewCard } from '../db/schema.js';

export class UserRepository {
  constructor(private readonly db: AppDatabase) {}

  findById(id: number): User | undefined {
    return this.db.select().from(users).where(eq(users.id, id)).get();
  }

  findByUsername(username: string): User | undefined {
    return this.db.select().from(users).where(eq(users.username, username.toLowerCase())).get();
  }

  findByEmail(email: string): User | undefined {
    return this.db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
  }

  findByUsernameOrEmail(identifier: string): User | undefined {
    const normalized = identifier.toLowerCase();
    return this.db
      .select()
      .from(users)
      .where(or(eq(users.username, normalized), eq(users.email, normalized)))
      .get();
  }

  createUserWithCard(userInput: NewUser, cardInput: Omit<NewCard, 'user_id'>): { userId: number } {
    return this.db.transaction((tx) => {
      const created = tx.insert(users).values(userInput).returning({ id: users.id }).get();
      tx.insert(cards)
        .values({
          ...cardInput,
          user_id: created.id,
        })
        .run();
      return { userId: created.id };
    });
  }

  updateMasterUser(id: number, email: string, passwordHash: string, updatedAt: string): void {
    this.db
      .update(users)
      .set({
        email,
        password_hash: passwordHash,
        role: 'master',
        status: 'active',
        updated_at: updatedAt,
      })
      .where(eq(users.id, id))
      .run();
  }

  updateStatus(id: number, status: 'active' | 'suspended', updatedAt: string): void {
    this.db.update(users).set({ status, updated_at: updatedAt }).where(eq(users.id, id)).run();
  }

  updatePasswordHash(id: number, passwordHash: string, updatedAt: string): void {
    this.db
      .update(users)
      .set({ password_hash: passwordHash, updated_at: updatedAt })
      .where(eq(users.id, id))
      .run();
  }

  deleteById(id: number): void {
    this.db.delete(users).where(eq(users.id, id)).run();
  }
}

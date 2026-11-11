import { eq } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { cards, type Card, type NewCard } from '../db/schema.js';

export class CardRepository {
  constructor(private readonly db: AppDatabase) {}

  findByUserId(userId: number): Card | undefined {
    return this.db.select().from(cards).where(eq(cards.user_id, userId)).get();
  }

  updateByUserId(
    userId: number,
    updates: Partial<Omit<NewCard, 'id' | 'user_id' | 'created_at'>>
  ): Card | undefined {
    return this.db.update(cards).set(updates).where(eq(cards.user_id, userId)).returning().get();
  }
}

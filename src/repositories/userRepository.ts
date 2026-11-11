import { and, asc, desc, eq, gte, or, sql, type SQL } from 'drizzle-orm';
import type { AppDatabase } from '../db/index.js';
import { users, cards, type User, type NewUser, type NewCard, type Card } from '../db/schema.js';
import type { AdminUserWithCard, MasterDashboardMetrics, SafeUser } from '../types/domain.js';

function stripPasswordHash(user: User): SafeUser {
  const { password_hash: _ignored, ...safeUser } = user;
  return safeUser;
}

function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

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

  getDashboardMetrics(): MasterDashboardMetrics {
    const sevenDaysAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const totalUsers =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .get()?.count ?? 0;

    const activeUsers =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.status, 'active'))
        .get()?.count ?? 0;

    const suspendedUsers =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(eq(users.status, 'suspended'))
        .get()?.count ?? 0;

    const publishedCards =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(cards)
        .where(eq(cards.is_published, true))
        .get()?.count ?? 0;

    const recentSignups7d =
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(users)
        .where(gte(users.created_at, sevenDaysAgoIso))
        .get()?.count ?? 0;

    return {
      totalUsers,
      activeUsers,
      suspendedUsers,
      publishedCards,
      recentSignups7d,
    };
  }

  listUsersWithCards(params: {
    q: string;
    status: 'all' | 'active' | 'suspended';
    page: number;
    limit: number;
  }): { items: AdminUserWithCard[]; totalCount: number } {
    const conditions: SQL[] = [];

    if (params.status !== 'all') {
      conditions.push(eq(users.status, params.status));
    }

    if (params.q.trim().length > 0) {
      const pattern = `%${escapeLikePattern(params.q.trim().toLowerCase())}%`;
      const searchCond = or(
        sql`lower(${users.username}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${users.email}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${cards.full_name}, '')) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${cards.company}, '')) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(coalesce(${cards.job_title}, '')) LIKE ${pattern} ESCAPE '\\'`
      );
      if (searchCond) conditions.push(searchCond);
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalRow = this.db
      .select({ count: sql<number>`count(*)` })
      .from(users)
      .leftJoin(cards, eq(users.id, cards.user_id))
      .where(whereClause)
      .get();

    const offset = (params.page - 1) * params.limit;

    const rows = this.db
      .select({ user: users, card: cards })
      .from(users)
      .leftJoin(cards, eq(users.id, cards.user_id))
      .where(whereClause)
      .orderBy(desc(users.created_at), desc(users.id))
      .limit(params.limit)
      .offset(offset)
      .all();

    return {
      items: rows.map((r) => ({ user: stripPasswordHash(r.user), card: r.card })),
      totalCount: totalRow?.count ?? 0,
    };
  }

  findUserWithCardById(id: number): AdminUserWithCard | undefined {
    const row = this.db
      .select({ user: users, card: cards })
      .from(users)
      .leftJoin(cards, eq(users.id, cards.user_id))
      .where(eq(users.id, id))
      .get();

    if (!row) return undefined;
    return {
      user: stripPasswordHash(row.user),
      card: row.card,
    };
  }

  listAllUsersWithCardsForExport(): AdminUserWithCard[] {
    const rows = this.db
      .select({ user: users, card: cards })
      .from(users)
      .leftJoin(cards, eq(users.id, cards.user_id))
      .orderBy(asc(users.id))
      .all();

    return rows.map((r) => ({ user: stripPasswordHash(r.user), card: r.card }));
  }

  updateUserAndCard(
    userId: number,
    userUpdates: {
      email: string;
      role: 'owner' | 'master';
      status: 'active' | 'suspended';
      updated_at: string;
    },
    cardUpdates: Partial<Omit<NewCard, 'id' | 'user_id' | 'created_at'>>
  ): AdminUserWithCard | undefined {
    return this.db.transaction((tx) => {
      const updatedUser = tx
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, userId))
        .returning()
        .get();

      if (!updatedUser) return undefined;

      const existingCard = tx.select().from(cards).where(eq(cards.user_id, userId)).get();
      let updatedCard: Card | null = null;
      if (existingCard) {
        updatedCard =
          tx.update(cards).set(cardUpdates).where(eq(cards.user_id, userId)).returning().get() ??
          null;
      }

      return {
        user: stripPasswordHash(updatedUser),
        card: updatedCard,
      };
    });
  }
}

import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { accounts, debts, financings, InsertUser, loans, monthlyConceptSettlements, recurringTransactions, transactions, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

async function hasFinancialData(userId: number) {
  const db = await getDb();
  if (!db) return false;
  const probes = await Promise.all([
    db.select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, userId)).limit(1),
    db.select({ id: loans.id }).from(loans).where(eq(loans.userId, userId)).limit(1),
    db.select({ id: financings.id }).from(financings).where(eq(financings.userId, userId)).limit(1),
    db.select({ id: recurringTransactions.id }).from(recurringTransactions).where(eq(recurringTransactions.userId, userId)).limit(1),
    db.select({ id: transactions.id }).from(transactions).where(eq(transactions.userId, userId)).limit(1),
    db.select({ id: monthlyConceptSettlements.id }).from(monthlyConceptSettlements).where(eq(monthlyConceptSettlements.userId, userId)).limit(1),
    db.select({ id: debts.id }).from(debts).where(eq(debts.userId, userId)).limit(1),
  ]);
  return probes.some(result => result.length > 0);
}

/**
 * Uses the existing owner record when an installation changes from an OAuth
 * identity to a local one. Foreign keys keep pointing to the same numeric user
 * id, so no financial row is copied, deleted or reassigned.
 */
export async function ensureLocalFinanceOwner(openId: string, displayName: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot initialize the local finance owner: database not available");
    return;
  }

  const currentLocal = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  const legacyOwner = await db
    .select()
    .from(users)
    .where(and(eq(users.email, ENV.allowedEmail), ne(users.openId, openId)))
    .limit(1);
  const candidate = legacyOwner[0];

  if (candidate && await hasFinancialData(candidate.id)) {
    await db.transaction(async tx => {
      const temporaryLocal = currentLocal[0];
      if (temporaryLocal) {
        await tx.update(users).set({
          openId: `retired-local:${temporaryLocal.id}:${Date.now()}`,
          loginMethod: "retired-local",
        }).where(eq(users.id, temporaryLocal.id));
      }
      await tx.update(users).set({
        openId,
        name: displayName,
        loginMethod: "local",
        lastSignedIn: new Date(),
      }).where(eq(users.id, candidate.id));
    });
    return;
  }

  const localOwner = currentLocal[0];
  if (localOwner) {
    await db.update(users).set({ name: displayName, loginMethod: "local", lastSignedIn: new Date() }).where(eq(users.id, localOwner.id));
    return;
  }

  await db.insert(users).values({
    openId,
    name: displayName,
    email: null,
    loginMethod: "local",
    lastSignedIn: new Date(),
  });
}

// TODO: add feature queries here as your schema grows.

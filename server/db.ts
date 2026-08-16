import { and, count, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { accounts, debts, financings, InsertUser, localCredentials, loans, monthlyConceptSettlements, recurringTransactions, transactions, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { hashLocalPassword, normalizeLocalUsername, verifyLocalPassword } from "./auth/localPasswords";

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

type FinanceDatabase = NonNullable<Awaited<ReturnType<typeof getDb>>>;

async function hasFinancialData(db: FinanceDatabase, userId: number) {
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

export function shouldClaimLegacyFinanceOwner(currentLocalId: number | undefined, legacyOwnerId: number | undefined, localHasFinancialData: boolean, legacyHasFinancialData: boolean) {
  return Boolean(legacyOwnerId && legacyHasFinancialData && !localHasFinancialData && legacyOwnerId !== currentLocalId);
}

/**
 * Uses the existing owner record when an installation changes from an OAuth
 * identity to a local one. Foreign keys keep pointing to the same numeric user
 * id, so no financial row is copied, deleted or reassigned.
 */
export async function ensureLocalFinanceOwnerWithDb(db: FinanceDatabase, openId: string, displayName: string): Promise<void> {
  const currentLocal = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  const localHasFinancialData = currentLocal[0] ? await hasFinancialData(db, currentLocal[0].id) : false;
  const historicOwners = await db.select().from(users).where(ne(users.openId, openId));
  const orderedHistoricOwners = [...historicOwners].sort((left, right) => {
    const leftIsExpectedLegacyOwner = left.email === ENV.allowedEmail ? 0 : 1;
    const rightIsExpectedLegacyOwner = right.email === ENV.allowedEmail ? 0 : 1;
    return leftIsExpectedLegacyOwner - rightIsExpectedLegacyOwner;
  });
  let candidate: typeof historicOwners[number] | undefined;
  for (const historicOwner of orderedHistoricOwners) {
    if (await hasFinancialData(db, historicOwner.id)) {
      candidate = historicOwner;
      break;
    }
  }
  const legacyHasFinancialData = Boolean(candidate);
  if (candidate && shouldClaimLegacyFinanceOwner(currentLocal[0]?.id, candidate.id, localHasFinancialData, legacyHasFinancialData)) {
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

export async function ensureLocalFinanceOwner(openId: string, displayName: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot initialize the local finance owner: database not available");
    return;
  }
  await ensureLocalFinanceOwnerWithDb(db, openId, displayName);
}

export async function getLocalAccessStatus() {
  const db = await getDb();
  if (!db) return { databaseAvailable: false, needsBootstrap: false };
  const [credential] = await db.select({ id: localCredentials.id }).from(localCredentials).limit(1);
  return { databaseAvailable: true, needsBootstrap: !credential };
}

export async function authenticateLocalAccess(username: string, password: string) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const normalizedUsername = normalizeLocalUsername(username);
  const [record] = await db
    .select({ credential: localCredentials, user: users })
    .from(localCredentials)
    .innerJoin(users, eq(localCredentials.userId, users.id))
    .where(and(eq(localCredentials.username, normalizedUsername), eq(localCredentials.isActive, true)))
    .limit(1);
  if (!record || !(await verifyLocalPassword(password, record.credential.passwordHash))) return undefined;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, record.user.id));
  return record.user;
}

export async function bootstrapLocalAccessWithDb(db: FinanceDatabase, input: { username: string; password: string; displayName: string }) {
  const normalizedUsername = normalizeLocalUsername(input.username);
  const [existingCredential] = await db.select({ id: localCredentials.id }).from(localCredentials).limit(1);
  if (existingCredential) throw new Error("BOOTSTRAP_ALREADY_COMPLETED");

  const openId = `local:${normalizedUsername}`;
  await ensureLocalFinanceOwnerWithDb(db, openId, input.displayName);
  const [owner] = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!owner) throw new Error("LOCAL_OWNER_NOT_CREATED");

  const passwordHash = await hashLocalPassword(input.password);
  await db.transaction(async tx => {
    const [credentialCreatedByAnotherRequest] = await tx.select({ id: localCredentials.id }).from(localCredentials).limit(1);
    if (credentialCreatedByAnotherRequest) throw new Error("BOOTSTRAP_ALREADY_COMPLETED");
    await tx.update(users).set({ name: input.displayName, loginMethod: "database", role: "admin", lastSignedIn: new Date() }).where(eq(users.id, owner.id));
    await tx.insert(localCredentials).values({ userId: owner.id, username: normalizedUsername, passwordHash });
  });
  return { ...owner, name: input.displayName, role: "admin" as const };
}

export async function bootstrapLocalAccess(input: { username: string; password: string; displayName: string }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return bootstrapLocalAccessWithDb(db, input);
}

export async function listLocalAccessUsers() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  return db
    .select({ id: users.id, name: users.name, role: users.role, username: localCredentials.username, isActive: localCredentials.isActive, lastSignedIn: users.lastSignedIn, createdAt: localCredentials.createdAt })
    .from(localCredentials)
    .innerJoin(users, eq(localCredentials.userId, users.id));
}

export async function createLocalAccessUser(input: { username: string; password: string; displayName: string; role: "user" | "admin" }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const normalizedUsername = normalizeLocalUsername(input.username);
  const [existing] = await db.select({ id: localCredentials.id }).from(localCredentials).where(eq(localCredentials.username, normalizedUsername)).limit(1);
  if (existing) throw new Error("USERNAME_ALREADY_EXISTS");
  const passwordHash = await hashLocalPassword(input.password);
  const openId = `local:${normalizedUsername}`;
  const [existingUser] = await db.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
  if (existingUser) throw new Error("USERNAME_ALREADY_EXISTS");
  const result = await db.transaction(async tx => {
    const inserted = await tx.insert(users).values({ openId, name: input.displayName, email: null, loginMethod: "database", role: input.role, lastSignedIn: new Date() });
    const userId = Number(inserted[0].insertId);
    await tx.insert(localCredentials).values({ userId, username: normalizedUsername, passwordHash });
    return { id: userId, name: input.displayName, role: input.role, username: normalizedUsername, isActive: true };
  });
  return result;
}

export function localAccessUpdateBlockReason(input: { actorUserId: number; targetUserId: number; targetRole: "user" | "admin"; requestedIsActive?: boolean; activeAdminCount: number }) {
  if (input.requestedIsActive !== false) return undefined;
  if (input.actorUserId === input.targetUserId) return "CANNOT_DISABLE_CURRENT_ADMIN";
  if (input.targetRole === "admin" && input.activeAdminCount <= 1) return "LAST_ADMIN_MUST_REMAIN_ACTIVE";
  return undefined;
}

export async function updateLocalAccessUser(actorUserId: number, input: { userId: number; password?: string; isActive?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [target] = await db
    .select({ credential: localCredentials, user: users })
    .from(localCredentials)
    .innerJoin(users, eq(localCredentials.userId, users.id))
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!target) throw new Error("USER_NOT_FOUND");
  if (input.isActive === false) {
    const accessUsers = await listLocalAccessUsers();
    const activeAdmins = accessUsers.filter(accessUser => accessUser.role === "admin" && accessUser.isActive);
    const blockReason = localAccessUpdateBlockReason({ actorUserId, targetUserId: target.user.id, targetRole: target.user.role, requestedIsActive: input.isActive, activeAdminCount: activeAdmins.length });
    if (blockReason) throw new Error(blockReason);
  }

  const credentialUpdate: Record<string, unknown> = {};
  if (input.password) credentialUpdate.passwordHash = await hashLocalPassword(input.password);
  if (input.isActive !== undefined) credentialUpdate.isActive = input.isActive;
  if (Object.keys(credentialUpdate).length) {
    await db.update(localCredentials).set(credentialUpdate).where(eq(localCredentials.userId, input.userId));
  }
  return { id: target.user.id, username: target.credential.username, isActive: input.isActive ?? target.credential.isActive };
}

// TODO: add feature queries here as your schema grows.

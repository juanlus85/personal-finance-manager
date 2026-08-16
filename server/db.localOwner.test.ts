import { describe, expect, it } from "vitest";
import { bootstrapLocalAccessWithDb, ensureLocalFinanceOwnerWithDb, localAccessUpdateBlockReason, shouldClaimLegacyFinanceOwner } from "./db";

function createChain<T>(result: T) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => chain,
    then: <R>(resolve: (value: T) => R | PromiseLike<R>, reject?: (reason: unknown) => R | PromiseLike<R>) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

describe("local finance owner migration", () => {
  it("claims the historic owner only when it has financial data and differs from the temporary local account", () => {
    expect(shouldClaimLegacyFinanceOwner(90, 7, false, true)).toBe(true);
    expect(shouldClaimLegacyFinanceOwner(90, 7, true, true)).toBe(false);
    expect(shouldClaimLegacyFinanceOwner(90, 7, false, false)).toBe(false);
    expect(shouldClaimLegacyFinanceOwner(7, 7, false, true)).toBe(false);
    expect(shouldClaimLegacyFinanceOwner(undefined, undefined, false, true)).toBe(false);
  });

  it("moves the local identity onto the historic financial owner instead of copying or losing its relations", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const results = [
      [{ id: 90, openId: "local:juanlu" }],
      [{ id: 7, openId: "google:historic", email: "juanlu85@gmail.com" }],
      [], [], [], [], [], [], [],
      [{ id: 1 }], [], [], [], [], [], [],
    ];
    let position = 0;
    const database = {
      select: () => createChain(results[position++] ?? []),
      update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => Promise.resolve() }; } }),
      insert: () => ({ values: () => Promise.resolve() }),
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback(database),
    };

    await ensureLocalFinanceOwnerWithDb(database as never, "local:juanlu", "Juanlu");

    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ loginMethod: "retired-local" });
    expect(updates[1]).toMatchObject({ openId: "local:juanlu", loginMethod: "local", name: "Juanlu" });
  });

  it("creates the first persistent credential on the historic financial owner without changing its user id", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const inserts: Array<Record<string, unknown>> = [];
    const historicOwner = { id: 7, openId: "google:historic", email: "juanlu85@gmail.com", name: "Juanlu", role: "user" };
    const results = [
      [],
      [],
      [historicOwner],
      [{ id: 1 }], [], [], [], [], [], [],
      [{ ...historicOwner, openId: "local:juanlu" }],
      [],
    ];
    let position = 0;
    const database = {
      select: () => createChain(results[position++] ?? []),
      update: () => ({ set: (values: Record<string, unknown>) => { updates.push(values); return { where: () => Promise.resolve() }; } }),
      insert: () => ({ values: (values: Record<string, unknown>) => { inserts.push(values); return Promise.resolve(); } }),
      transaction: async (callback: (tx: unknown) => Promise<void>) => callback(database),
    };

    const result = await bootstrapLocalAccessWithDb(database as never, { username: "Juanlu", password: "una-clave-segura", displayName: "Juanlu" });

    expect(result).toMatchObject({ id: 7, role: "admin" });
    expect(updates).toEqual(expect.arrayContaining([expect.objectContaining({ openId: "local:juanlu" }), expect.objectContaining({ role: "admin", loginMethod: "database" })]));
    expect(inserts).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 7, username: "juanlu", passwordHash: expect.stringMatching(/^scrypt\$/) })]));
  });

  it("does not allow the current or final active administrator to be disabled", () => {
    expect(localAccessUpdateBlockReason({ actorUserId: 1, targetUserId: 1, targetRole: "admin", requestedIsActive: false, activeAdminCount: 2 })).toBe("CANNOT_DISABLE_CURRENT_ADMIN");
    expect(localAccessUpdateBlockReason({ actorUserId: 1, targetUserId: 2, targetRole: "admin", requestedIsActive: false, activeAdminCount: 1 })).toBe("LAST_ADMIN_MUST_REMAIN_ACTIVE");
    expect(localAccessUpdateBlockReason({ actorUserId: 1, targetUserId: 2, targetRole: "admin", requestedIsActive: false, activeAdminCount: 2 })).toBeUndefined();
    expect(localAccessUpdateBlockReason({ actorUserId: 1, targetUserId: 2, targetRole: "user", requestedIsActive: true, activeAdminCount: 1 })).toBeUndefined();
  });
});

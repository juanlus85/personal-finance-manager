import { describe, expect, it } from "vitest";
import { ensureLocalFinanceOwnerWithDb, shouldClaimLegacyFinanceOwner } from "./db";

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
});

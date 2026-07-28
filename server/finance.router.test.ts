import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn() }));

import { getDb } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createChain<T>(result: T) {
  const chain = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    leftJoin: () => chain,
    innerJoin: () => chain,
    limit: () => chain,
    then: <R>(resolve: (value: T) => R | PromiseLike<R>, reject?: (reason: unknown) => R | PromiseLike<R>) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function createEmptyDatabase() {
  return {
    select: vi.fn(() => createChain([])),
    transaction: vi.fn(),
  };
}

function createSequencedDatabase(results: unknown[]) {
  let position = 0;
  return {
    select: vi.fn(() => createChain(results[position++] ?? [])),
    transaction: vi.fn(),
  };
}

function createWritableDatabase(selectResults: unknown[] = []) {
  let insertId = 100;
  let selectPosition = 0;
  const inserted: Array<Record<string, unknown>> = [];
  const updated: Array<Record<string, unknown>> = [];
  const deleted: unknown[] = [];
  const database = {
    select: vi.fn(() => createChain(selectResults[selectPosition++] ?? [])),
    insert: vi.fn(() => ({
      values: vi.fn((value: Record<string, unknown>) => {
        inserted.push(value);
        const result = Promise.resolve([{ insertId: ++insertId }]);
        return {
          onDuplicateKeyUpdate: vi.fn(() => result),
          then: result.then.bind(result),
        };
      }),
    })),
    delete: vi.fn((table: unknown) => ({ where: vi.fn(() => { deleted.push(table); return Promise.resolve(); }) })),
    update: vi.fn(() => ({ set: vi.fn((value: Record<string, unknown>) => { updated.push(value); return { where: vi.fn(() => Promise.resolve()) }; }) })),
    transaction: vi.fn(),
  };
  database.transaction.mockImplementation(async callback => callback(database));
  return { database, inserted, updated, deleted };
}

function createScopeInspectingDatabase() {
  const whereCalls: unknown[] = [];
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: (condition: unknown) => { whereCalls.push(condition); return chain; },
    orderBy: () => chain,
    limit: () => chain,
    then: <T>(resolve: (value: Array<{ id: number }>) => T | PromiseLike<T>, reject?: (reason: unknown) => T | PromiseLike<T>) => Promise.resolve([{ id: 1 }]).then(resolve, reject),
  };
  const database = {
    select: vi.fn(() => chain),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn((condition: unknown) => { whereCalls.push(condition); return Promise.resolve(); }) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
  };
  return { database, whereCalls };
}

function containsPrimitive(value: unknown, target: string | number, seen = new Set<object>()): boolean {
  if (value === target) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  return Object.values(value).some(entry => containsPrimitive(entry, target, seen));
}

function createContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 7,
    openId: "finance-test-user",
    email: "juanlu85@gmail.com",
    name: "Juan Luis",
    loginMethod: "google",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("finance router", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockResolvedValue(createEmptyDatabase() as never);
  });

  it("returns a zeroed monthly summary when the user has not added financial data", async () => {
    const caller = appRouter.createCaller(createContext());
    const summary = await caller.finance.monthlySummary({ month: "2026-07" });

    expect(summary.month).toBe("2026-07");
    expect(summary.balances).toMatchObject({
      confirmedIncome: 0,
      possibleIncome: 0,
      expenses: 0,
      confirmedBalance: 0,
      balanceWithPossibleIncome: 0,
      linesWithoutConversion: 0,
    });
    expect(summary.lines).toEqual([]);
  });

  it("builds a month-by-month trend with a stable number of periods", async () => {
    const caller = appRouter.createCaller(createContext());
    const trend = await caller.finance.monthlyTrend({ endMonth: "2026-07", count: 3 });

    expect(trend).toHaveLength(3);
    expect(trend.map(item => item.month)).toEqual(["2026-05", "2026-06", "2026-07"]);
    expect(trend.every(item => item.confirmedBalance === 0 && item.balanceWithPossibleIncome === 0)).toBe(true);
  });

  it("exports only the portable finance envelope for the authenticated user", async () => {
    const caller = appRouter.createCaller(createContext());
    const exported = await caller.finance.exportData();

    expect(exported.format).toBe("lumen-finanzas-export");
    expect(exported.version).toBe(1);
    expect(exported.baseCurrency).toBe("EUR");
    expect(exported.data.transactions).toEqual([]);
    expect(exported.data.loans).toEqual([]);
  });

  it("rejects an invalid backup before opening a database transaction", async () => {
    const database = createEmptyDatabase();
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.finance.importData({ backup: { format: "unknown", version: 1, data: {} } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it("calculates confirmed and possible balances from non-empty monthly data", async () => {
    const database = createSequencedDatabase([
      [
        { id: 1, name: "Nómina", direction: "income", certainty: "confirmed", currency: "EUR", amount: "2000.00", category: "Trabajo", startDate: "2026-01-01", endDate: null },
        { id: 2, name: "Alquiler Ecuador", direction: "income", certainty: "possible", currency: "USD", amount: "1000.00", category: "Alquiler", startDate: "2026-01-01", endDate: null },
      ],
      [{ id: 3, name: "Hipoteca", currency: "EUR", monthlyPayment: "500.00" }],
      [],
      [{ id: 4, description: "Supermercado", direction: "expense", certainty: "confirmed", kind: "card_expense", currency: "EUR", amount: "250.00", exchangeRateToEur: null, effectiveDate: "2026-07-10", category: "Alimentación" }],
      [{ fromCurrency: "USD", rate: "0.90000000", effectiveOn: "2026-07-01" }],
      [], [], [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const summary = await caller.finance.monthlySummary({ month: "2026-07" });

    expect(summary.balances).toMatchObject({
      confirmedIncome: 2000,
      possibleIncome: 900,
      expenses: 750,
      confirmedBalance: 1250,
      balanceWithPossibleIncome: 2150,
    });
    expect(summary.expenseBreakdown).toEqual(expect.arrayContaining([{ label: "Préstamos", amount: 500 }, { label: "Alimentación", amount: 250 }]));
    expect(summary.incomeBreakdown).toEqual(expect.arrayContaining([{ label: "Trabajo", amount: 2000 }, { label: "Alquiler", amount: 900 }]));
  });

  it("excludes a loan after its final month in the historical trend", async () => {
    const database = createSequencedDatabase([
      [{ id: 1, direction: "income", certainty: "confirmed", currency: "EUR", amount: "1000.00", startDate: "2026-01-01", endDate: null }],
      [{ id: 2, currency: "EUR", monthlyPayment: "200.00", startDate: "2026-01-01", endDate: "2026-06-30" }],
      [],
      [{ id: 3, direction: "expense", certainty: "confirmed", kind: "card_expense", currency: "EUR", amount: "50.00", exchangeRateToEur: null, effectiveDate: "2026-07-08" }],
      [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const trend = await caller.finance.monthlyTrend({ endMonth: "2026-07", count: 3 });

    expect(trend.map(item => item.expenses)).toEqual([200, 200, 50]);
    expect(trend.map(item => item.confirmedBalance)).toEqual([800, 800, 950]);
  });

  it("restores a valid portable backup while remapping category and account relations", async () => {
    const { database, inserted } = createWritableDatabase([
      [{ id: 55, name: "Trabajo", direction: "income" }],
      [{ id: 77, name: "Banco principal", currency: "EUR" }],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const result = await caller.finance.importData({
      backup: {
        format: "lumen-finanzas-export",
        version: 1,
        data: {
          categories: [{ id: 1, name: "Trabajo", direction: "income", color: "#4C7A68", icon: null, isActive: true }],
          accounts: [{ id: 1, name: "Banco principal", type: "bank", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: true }],
          accountBalanceSnapshots: [], exchangeRates: [], loans: [], loanFeatures: [], loanInstallments: [], financings: [], recurringTransactions: [],
          transactions: [{ categoryId: 1, accountId: 1, description: "Ingreso restaurado", direction: "income", kind: "extra_income", certainty: "confirmed", currency: "EUR", amount: 100, exchangeRateToEur: null, effectiveDate: "2026-07-01", notes: null }],
          debts: [],
        },
      },
    });

    expect(result).toMatchObject({ success: true, imported: { categories: 0, accounts: 0, transactions: 1 } });
    expect(inserted.find(value => value.description === "Ingreso restaurado")).toMatchObject({ categoryId: 55, accountId: 77, userId: 7 });
  });

  it("writes the core finance entities under the authenticated user", async () => {
    const { database, inserted } = createWritableDatabase();
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await caller.finance.accounts.save({ name: "Caja", type: "cash", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: true });
    await caller.finance.exchangeRates.save({ fromCurrency: "USD", rate: 0.91, effectiveOn: "2026-07-01", note: null });
    await caller.finance.loans.save({ name: "Préstamo prueba", lender: null, currency: "EUR", originalPrincipal: 1000, currentPrincipal: 900, annualInterestRate: 2, monthlyPayment: 100, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "active", notes: null, features: [], regenerateSchedule: false });
    await caller.finance.financings.save({ concept: "Financiación prueba", provider: null, currency: "EUR", monthlyAmount: 20, totalAmount: 240, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "active", notes: null });
    await caller.finance.transactions.save({ description: "Tarjeta prueba", direction: "expense", kind: "card_expense", certainty: "confirmed", currency: "EUR", amount: 40, exchangeRateToEur: null, effectiveDate: "2026-07-10", categoryId: null, accountId: null, notes: null });
    await caller.finance.debts.save({ counterparty: "Tercero", direction: "in_favor", currency: "EUR", amount: 30, originatedOn: "2026-07-01", dueDate: null, status: "open", notes: null });

    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 7, name: "Caja" }),
      expect.objectContaining({ userId: 7, fromCurrency: "USD", toCurrency: "EUR" }),
      expect.objectContaining({ userId: 7, name: "Préstamo prueba" }),
      expect.objectContaining({ userId: 7, concept: "Financiación prueba" }),
      expect.objectContaining({ userId: 7, description: "Tarjeta prueba" }),
      expect.objectContaining({ userId: 7, counterparty: "Tercero" }),
    ]));
  });

  it("lists accounts, rates, loans, financings, movements and debts for the current user", async () => {
    const database = createSequencedDatabase([
      [{ id: 1, name: "Caja", currency: "EUR" }],
      [{ id: 2, fromCurrency: "USD", rate: "0.91000000", effectiveOn: "2026-07-01" }],
      [{ id: 3, name: "Préstamo", endDate: "2026-12-31" }],
      [{ id: 4, loanId: 3, label: "Finalidad", value: "Vivienda", sortOrder: 0 }],
      [{ id: 5, concept: "Financiación", endDate: "2026-09-01" }],
      [{ id: 6, description: "Tarjeta", effectiveDate: "2026-07-02" }],
      [{ id: 7, counterparty: "Tercero", status: "open" }],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.finance.accounts.list()).resolves.toEqual([{ id: 1, name: "Caja", currency: "EUR" }]);
    await expect(caller.finance.exchangeRates.list()).resolves.toHaveLength(1);
    await expect(caller.finance.loans.list()).resolves.toEqual([expect.objectContaining({ id: 3, features: [{ id: 4, loanId: 3, label: "Finalidad", value: "Vivienda", sortOrder: 0 }] })]);
    await expect(caller.finance.financings.list()).resolves.toHaveLength(1);
    await expect(caller.finance.transactions.list({ month: "2026-07" })).resolves.toHaveLength(1);
    await expect(caller.finance.debts.list()).resolves.toHaveLength(1);
  });

  it("updates active finance records and removes a transaction without creating ownership-transfer values", async () => {
    const { database, updated, inserted, deleted } = createWritableDatabase([[{ id: 9 }]]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await caller.finance.accounts.save({ id: 1, name: "Caja editada", type: "cash", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: false });
    await caller.finance.exchangeRates.save({ id: 2, fromCurrency: "USD", rate: 0.92, effectiveOn: "2026-07-01", note: "Actualizado" });
    await caller.finance.loans.save({ id: 9, name: "Préstamo editado", lender: null, currency: "EUR", originalPrincipal: 1000, currentPrincipal: 850, annualInterestRate: 2, monthlyPayment: 100, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "archived", notes: null, features: [], regenerateSchedule: false });
    await caller.finance.financings.save({ id: 3, concept: "Financiación editada", provider: null, currency: "EUR", monthlyAmount: 20, totalAmount: 240, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "archived", notes: null });
    await caller.finance.transactions.save({ id: 4, description: "Tarjeta editada", direction: "expense", kind: "card_expense", certainty: "confirmed", currency: "EUR", amount: 40, exchangeRateToEur: null, effectiveDate: "2026-07-10", categoryId: null, accountId: null, notes: null });
    await caller.finance.debts.save({ id: 5, counterparty: "Tercero", direction: "in_favor", currency: "EUR", amount: 30, originatedOn: "2026-07-01", dueDate: null, status: "settled", notes: null });
    await caller.finance.transactions.remove({ id: 4 });
    await caller.finance.exchangeRates.remove({ id: 2 });

    expect(updated).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Caja editada", isActive: false }),
      expect.objectContaining({ rate: "0.92000000", note: "Actualizado" }),
      expect.objectContaining({ name: "Préstamo editado", status: "archived" }),
      expect.objectContaining({ concept: "Financiación editada", status: "archived" }),
      expect.objectContaining({ description: "Tarjeta editada" }),
      expect.objectContaining({ counterparty: "Tercero", status: "settled" }),
    ]));
    expect(updated.every(value => !("userId" in value))).toBe(true);
    expect(inserted).toEqual([]);
    expect(deleted.length).toBeGreaterThanOrEqual(3);
  });

  it("refuses loan and balance operations when the referenced record does not belong to the user", async () => {
    const { database, updated, inserted } = createWritableDatabase([[], []]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.finance.loans.save({ id: 99, name: "Ajeno", lender: null, currency: "EUR", originalPrincipal: 1000, currentPrincipal: 900, annualInterestRate: 2, monthlyPayment: 100, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "active", notes: null, features: [], regenerateSchedule: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.finance.accounts.saveBalance({ accountId: 88, balance: 25, recordedOn: "2026-07-01", note: null })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(updated).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("adds the authenticated user scope to representative lists and updates", async () => {
    const { database, whereCalls } = createScopeInspectingDatabase();
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await caller.finance.accounts.list();
    await caller.finance.exchangeRates.list();
    await caller.finance.loans.list();
    await caller.finance.financings.list();
    await caller.finance.transactions.list({ month: "2026-07" });
    await caller.finance.debts.list();
    await caller.finance.accounts.save({ id: 1, name: "Caja aislada", type: "cash", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: true });
    await caller.finance.exchangeRates.save({ id: 1, fromCurrency: "USD", rate: 0.92, effectiveOn: "2026-07-01", note: null });
    await caller.finance.loans.save({ id: 1, name: "Préstamo aislado", lender: null, currency: "EUR", originalPrincipal: 1000, currentPrincipal: 900, annualInterestRate: 2, monthlyPayment: 100, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "active", notes: null, features: [], regenerateSchedule: false });
    await caller.finance.financings.save({ id: 1, concept: "Financiación aislada", provider: null, currency: "EUR", monthlyAmount: 20, totalAmount: 240, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "active", notes: null });
    await caller.finance.transactions.save({ id: 1, description: "Movimiento aislado", direction: "expense", kind: "manual_expense", certainty: "confirmed", currency: "EUR", amount: 10, exchangeRateToEur: null, effectiveDate: "2026-07-10", categoryId: null, accountId: null, notes: null });

    const [
      accountsListScope,
      exchangeRatesListScope,
      loansListScope,
      _loanFeaturesScope,
      financingsListScope,
      _transactionsListScope,
      _debtsListScope,
      _accountsUpdateScope,
      exchangeRatesUpdateScope,
      loansOwnershipScope,
      loansUpdateScope,
      financingsUpdateScope,
    ] = whereCalls;
    expect(containsPrimitive(exchangeRatesListScope, 7)).toBe(true);
    expect(containsPrimitive(exchangeRatesUpdateScope, 7)).toBe(true);
    expect(containsPrimitive(loansListScope, 7)).toBe(true);
    expect(containsPrimitive(loansOwnershipScope, 7)).toBe(true);
    expect(containsPrimitive(loansUpdateScope, 7)).toBe(true);
    expect(containsPrimitive(financingsListScope, 7)).toBe(true);
    expect(containsPrimitive(financingsUpdateScope, 7)).toBe(true);
    expect(containsPrimitive(accountsListScope, 7)).toBe(true);
  });
});

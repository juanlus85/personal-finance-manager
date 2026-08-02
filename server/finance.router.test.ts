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

  it("includes a future card forecast in the corresponding month of the reporting trend", async () => {
    const database = createSequencedDatabase([
      [], [], [],
      [{ id: 90, description: "BBVA · pago previsto", direction: "expense", certainty: "confirmed", kind: "card_forecast", currency: "EUR", amount: "420.00", exchangeRateToEur: null, effectiveDate: "2026-08-01" }],
      [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const trend = await caller.finance.monthlyTrend({ endMonth: "2026-08", count: 3 });

    expect(trend.map(item => ({ month: item.month, expenses: item.expenses, confirmedBalance: item.confirmedBalance }))).toEqual([
      { month: "2026-06", expenses: 0, confirmedBalance: 0 },
      { month: "2026-07", expenses: 0, confirmedBalance: 0 },
      { month: "2026-08", expenses: 420, confirmedBalance: -420 },
    ]);
  });

  it("exports only the portable finance envelope for the authenticated user", async () => {
    const caller = appRouter.createCaller(createContext());
    const exported = await caller.finance.exportData();

    expect(exported.format).toBe("lumen-finanzas-export");
    expect(exported.version).toBe(1);
    expect(exported.baseCurrency).toBe("EUR");
    expect(exported.data.transactions).toEqual([]);
    expect(exported.data.monthlyConceptSettlements).toEqual([]);
    expect(exported.data.loans).toEqual([]);
  });

  it("round-trips balances and settled concepts through an exported portable backup", async () => {
    const source = createSequencedDatabase([
      [{ id: 1, userId: 7, name: "Gastos", direction: "expense", color: "#4C7A68", icon: null, isActive: true }],
      [{ id: 2, userId: 7, name: "BBVA", type: "bank", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: true }],
      [{ id: 3, accountId: 2, balance: "5468.44", recordedOn: "2026-08-02", note: "Saldo liquidado" }],
      [],
      [{ id: 5, userId: 7, name: "Préstamo", lender: null, currency: "EUR", originalPrincipal: "1000.00", currentPrincipal: "800.00", annualInterestRate: "2.00000", monthlyPayment: "100.00", paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "active", notes: null }],
      [], [],
      [{ id: 6, userId: 7, concept: "Financiación", provider: null, currency: "EUR", monthlyAmount: "80.00", totalAmount: "800.00", paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "active", notes: null }],
      [{ id: 7, userId: 7, categoryId: 1, accountId: 2, name: "Recibo", direction: "expense", kind: "recurring_bill", certainty: "confirmed", currency: "EUR", amount: "50.00", dayOfMonth: 1, startDate: "2026-01-01", endDate: null, notes: null, isActive: true }],
      [{ id: 8, userId: 7, categoryId: 1, accountId: 2, description: "Carrefour", direction: "expense", kind: "card_expense", certainty: "confirmed", currency: "EUR", amount: "833.00", exchangeRateToEur: null, effectiveDate: "2026-08-02", notes: null }],
      [{ id: 9, userId: 7, month: "2026-08", conceptId: "transaction-8", source: "card_expense", description: "Carrefour", direction: "expense", certainty: "confirmed", currency: "EUR", plannedAmount: "833.00", plannedAmountEur: "833.00", amount: "810.00", amountEur: "810.00", accountId: 2, status: "settled", settledOn: "2026-08-02" }],
      [],
    ]);
    vi.mocked(getDb).mockResolvedValue(source as never);
    const exported = await appRouter.createCaller(createContext()).finance.exportData();
    const { database: target, inserted } = createWritableDatabase([[], []]);
    vi.mocked(getDb).mockResolvedValue(target as never);

    await appRouter.createCaller(createContext()).finance.importData({ backup: exported });

    expect(inserted.find(value => value.recordedOn === "2026-08-02")).toMatchObject({ accountId: 102, balance: "5468.44", note: "Saldo liquidado" });
    expect(inserted.find(value => value.conceptId === "transaction-107")).toMatchObject({
      accountId: 102,
      status: "settled",
      settledOn: "2026-08-02",
      plannedAmount: "833.00",
      plannedAmountEur: "833.00",
      amount: "810.00",
      amountEur: "810.00",
    });
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
          transactions: [{ id: 99, categoryId: 1, accountId: 1, description: "Ingreso restaurado", direction: "income", kind: "extra_income", certainty: "confirmed", currency: "EUR", amount: 100, exchangeRateToEur: null, effectiveDate: "2026-07-01", notes: null }],
          monthlyConceptSettlements: [{ month: "2026-07", conceptId: "transaction-99", source: "card_forecast", description: "Amex · pago previsto", direction: "expense", certainty: "confirmed", currency: "EUR", plannedAmount: 180, plannedAmountEur: 180, amount: 175, amountEur: 175, accountId: 1, status: "settled", settledOn: "2026-07-05" }],
          debts: [],
        },
      },
    });

    expect(result).toMatchObject({ success: true, imported: { categories: 0, accounts: 0, transactions: 1 } });
    expect(inserted.find(value => value.description === "Ingreso restaurado")).toMatchObject({ categoryId: 55, accountId: 77, userId: 7 });
    expect(inserted.find(value => value.conceptId === "transaction-101")).toMatchObject({ userId: 7, source: "card_forecast", plannedAmount: "180.00", amount: "175.00", accountId: 77, status: "settled", settledOn: "2026-07-05" });
  });

  it("preserves settled states when every source concept receives a new imported id", async () => {
    const { database, inserted } = createWritableDatabase([[], []]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const settled = (conceptId: string, source: "loan" | "financing" | "recurring" | "card_expense") => ({
      month: "2026-08", conceptId, source, description: `Liquidación ${source}`, direction: "expense" as const,
      certainty: "confirmed" as const, currency: "EUR" as const, plannedAmount: 100, plannedAmountEur: 100,
      amount: 95, amountEur: 95, accountId: 1, status: "settled" as const, settledOn: "2026-08-02",
    });

    await caller.finance.importData({
      backup: {
        format: "lumen-finanzas-export", version: 1,
        data: {
          categories: [{ id: 1, name: "Fijos", direction: "expense", color: "#4C7A68", icon: null, isActive: true }],
          accounts: [{ id: 1, name: "Cuenta restaurada", type: "bank", currency: "EUR", institution: null, includeInLiquidity: true, notes: null, isActive: true }],
          accountBalanceSnapshots: [], exchangeRates: [], loanFeatures: [], loanInstallments: [], debts: [],
          loans: [{ id: 5, name: "Préstamo restaurado", lender: null, currency: "EUR", originalPrincipal: 1000, currentPrincipal: 800, annualInterestRate: 2, monthlyPayment: 100, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", amortizationMethod: "manual", status: "active", notes: null }],
          financings: [{ id: 6, concept: "Financiación restaurada", provider: null, currency: "EUR", monthlyAmount: 100, totalAmount: 1000, paymentDay: 1, startDate: "2026-01-01", endDate: "2026-12-31", status: "active", notes: null }],
          recurringTransactions: [{ id: 7, categoryId: 1, accountId: 1, name: "Recibo restaurado", direction: "expense", kind: "recurring_bill", certainty: "confirmed", currency: "EUR", amount: 100, dayOfMonth: 1, startDate: "2026-01-01", endDate: null, notes: null, isActive: true }],
          transactions: [{ id: 8, categoryId: 1, accountId: 1, description: "Tarjeta restaurada", direction: "expense", kind: "card_expense", certainty: "confirmed", currency: "EUR", amount: 100, exchangeRateToEur: null, effectiveDate: "2026-08-02", notes: null }],
          monthlyConceptSettlements: [settled("loan-5", "loan"), settled("financing-6", "financing"), settled("recurring-7", "recurring"), settled("transaction-8", "card_expense")],
        },
      },
    });

    const restoredSettlements = inserted.filter(value => typeof value.conceptId === "string");
    expect(restoredSettlements.map(value => value.conceptId)).toEqual(["loan-103", "financing-104", "recurring-105", "transaction-106"]);
    expect(restoredSettlements.every(value => value.status === "settled" && value.accountId === 102 && value.amount === "95.00")).toBe(true);
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
    await caller.finance.transactions.save({ description: "Amex · pago previsto", direction: "expense", kind: "card_forecast", certainty: "confirmed", currency: "EUR", amount: 180, exchangeRateToEur: null, effectiveDate: "2026-08-01", categoryId: null, accountId: null, notes: null });
    await caller.finance.transactions.save({ description: "Médico posible", direction: "expense", kind: "possible_expense", certainty: "possible", currency: "EUR", amount: 65, exchangeRateToEur: null, effectiveDate: "2026-07-20", categoryId: null, accountId: null, notes: null });
    await caller.finance.debts.save({ counterparty: "Tercero", direction: "in_favor", currency: "EUR", amount: 30, originatedOn: "2026-07-01", dueDate: null, status: "open", notes: null });

    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 7, name: "Caja" }),
      expect.objectContaining({ userId: 7, fromCurrency: "USD", toCurrency: "EUR" }),
      expect.objectContaining({ userId: 7, name: "Préstamo prueba" }),
      expect.objectContaining({ userId: 7, concept: "Financiación prueba" }),
      expect.objectContaining({ userId: 7, description: "Tarjeta prueba" }),
      expect.objectContaining({ userId: 7, description: "Amex · pago previsto", kind: "card_forecast", effectiveDate: "2026-08-01" }),
      expect.objectContaining({ userId: 7, description: "Médico posible", kind: "possible_expense", certainty: "possible" }),
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

  it("records and reverses a monthly settlement only for the authenticated user and a matching account currency", async () => {
    const { database, inserted, deleted } = createWritableDatabase([[{ id: 44, currency: "EUR" }]]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await caller.finance.settlements.settle({ month: "2026-07", conceptId: "recurring-8", source: "recurring", description: "Nómina", direction: "income", certainty: "confirmed", currency: "EUR", plannedAmount: 2000, plannedAmountEur: 2000, amount: 2015, amountEur: 2015, accountId: 44, settledOn: "2026-07-28" });
    await caller.finance.settlements.undo({ month: "2026-07", conceptId: "recurring-8" });

    expect(inserted).toEqual(expect.arrayContaining([expect.objectContaining({ userId: 7, month: "2026-07", conceptId: "recurring-8", accountId: 44, plannedAmount: "2000.00", amount: "2015.00", status: "settled" })]));
    expect(deleted).toHaveLength(1);
  });

  it("allows an immediate settlement outside its planned month and updates the chosen account snapshot", async () => {
    const { database, inserted } = createWritableDatabase([[{ id: 44, currency: "EUR" }], [], []]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await expect(caller.finance.settlements.settle({ month: "2026-07", conceptId: "recurring-8", source: "recurring", description: "Nómina", direction: "income", certainty: "confirmed", currency: "EUR", plannedAmount: 2000, plannedAmountEur: 2000, amount: 2000, amountEur: 2000, accountId: 44, settledOn: "2026-08-01" })).resolves.toEqual({ success: true });
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ conceptId: "recurring-8", accountId: 44, status: "settled" }),
      expect.objectContaining({ accountId: 44, recordedOn: expect.any(String), balance: "2000.00" }),
    ]));
  });

  it("deducts a paid concept from the selected account immediately even when its planned month differs", async () => {
    const { database, inserted } = createWritableDatabase([
      [{ id: 1, currency: "EUR" }],
      [],
      [{ balance: "6301.44" }],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());

    await caller.finance.settlements.settle({
      month: "2026-08",
      conceptId: "transaction-99",
      source: "card_forecast",
      description: "Carrefour · pago previsto",
      direction: "expense",
      certainty: "confirmed",
      currency: "EUR",
      plannedAmount: 833,
      plannedAmountEur: 833,
      amount: 833,
      amountEur: 833,
      accountId: 1,
      settledOn: "2026-07-31",
    });

    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ conceptId: "transaction-99", accountId: 1, amount: "833.00" }),
      expect.objectContaining({ accountId: 1, balance: "5468.44", note: "Actualizado al liquidar un cobro o pago" }),
    ]));
  });

  it("updates the available balance of the settled account from its opening snapshot with collected and paid concepts", async () => {
    const database = createSequencedDatabase([
      [], [], [],
      [
        { id: 1, accountId: 1, description: "Cobro temporal", direction: "income", certainty: "confirmed", kind: "extra_income", currency: "EUR", amount: "100.00", exchangeRateToEur: null, effectiveDate: "2026-07-10", category: "Ingresos" },
        { id: 2, accountId: 1, description: "Pago temporal", direction: "expense", certainty: "confirmed", kind: "card_expense", currency: "EUR", amount: "30.00", exchangeRateToEur: null, effectiveDate: "2026-07-11", category: "Gastos" },
      ],
      [],
      [{ id: 1, name: "Banco", type: "bank", currency: "EUR", includeInLiquidity: true }],
      [{ id: 9, accountId: 1, balance: "1000.00", recordedOn: "2026-07-01", note: null }],
      [],
      [
        { id: 21, conceptId: "transaction-1", status: "settled", accountId: 1, settledOn: "2026-07-10", plannedAmount: "100.00", plannedAmountEur: "100.00", amount: "120.00", amountEur: "120.00" },
        { id: 22, conceptId: "transaction-2", status: "settled", accountId: 1, settledOn: "2026-07-11", plannedAmount: "30.00", plannedAmountEur: "30.00", amount: "25.00", amountEur: "25.00" },
      ],
      [
        { accountId: 1, direction: "income", amount: "120.00", settledOn: "2026-07-10" },
        { accountId: 1, direction: "expense", amount: "25.00", settledOn: "2026-07-11" },
      ],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const summary = await appRouter.createCaller(createContext()).finance.monthlySummary({ month: "2026-07" });

    expect(summary.availableLiquidity).toBe(1095);
    expect(summary.accountLiquidity[0]).toMatchObject({ id: 1, openingBalance: 1000, balance: 1095, settlementChange: 95 });
    expect(summary.settlement).toMatchObject({ settledIncome: 120, settledExpenses: 25, settledNet: 95, settledVarianceNet: 25, settledConcepts: 2 });
    expect(summary.lines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transaction-1", plannedAmount: 100, settledAmount: 120 }), expect.objectContaining({ id: "transaction-2", plannedAmount: 30, settledAmount: 25 })]));
    expect(summary.lines.every(line => line.settlementStatus === "settled")).toBe(true);
  });

  it("shows a recurring concept as pending again when the following month has no settlement record", async () => {
    const recurringLine = { id: 1, accountId: null, name: "Nómina", direction: "income", certainty: "confirmed", currency: "EUR", amount: "1000.00", category: "Trabajo", startDate: "2026-01-01", endDate: null };
    const database = createSequencedDatabase([
      [recurringLine], [], [], [], [], [], [], [],
      [{ id: 31, conceptId: "recurring-1", status: "settled", accountId: null, settledOn: "2026-07-05" }], [],
      [recurringLine], [], [], [], [], [], [], [], [], [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const july = await caller.finance.monthlySummary({ month: "2026-07" });
    const august = await caller.finance.monthlySummary({ month: "2026-08" });

    expect(july.lines[0]).toMatchObject({ id: "recurring-1", settlementStatus: "settled" });
    expect(august.lines[0]).toMatchObject({ id: "recurring-1", settlementStatus: "pending" });
    expect(august.settlement).toMatchObject({ settledConcepts: 0, pendingConcepts: 1, pendingConfirmedIncome: 1000 });
  });

  it("includes a card forecast only in its chosen future month and exposes it as a pending expense", async () => {
    const database = createSequencedDatabase([
      [], [], [],
      [{ id: 8, accountId: null, description: "Amex · pago previsto", direction: "expense", certainty: "confirmed", kind: "card_forecast", currency: "EUR", amount: "180.00", exchangeRateToEur: null, effectiveDate: "2026-08-01", category: "Tarjetas" }],
      [], [], [], [], [], [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const summary = await appRouter.createCaller(createContext()).finance.monthlySummary({ month: "2026-08" });

    expect(summary.balances).toMatchObject({ expenses: 180, confirmedBalance: -180 });
    expect(summary.lines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transaction-8", source: "card_forecast", settlementStatus: "pending" })]));
    expect(summary.settlement).toMatchObject({ pendingExpenses: 180, pendingConcepts: 1 });
  });

  it("keeps possible expenses and card forecasts in their corresponding months without carrying one-offs forward", async () => {
    const database = createSequencedDatabase([
      [], [], [],
      [{ id: 31, accountId: null, description: "Médico posible", direction: "expense", certainty: "possible", kind: "possible_expense", currency: "EUR", amount: "70.00", exchangeRateToEur: null, effectiveDate: "2026-07-15", category: "Salud" }],
      [], [], [], [], [], [],
      [], [], [],
      [{ id: 32, accountId: null, description: "Carrefour · pago previsto", direction: "expense", certainty: "confirmed", kind: "card_forecast", currency: "EUR", amount: "240.00", exchangeRateToEur: null, effectiveDate: "2026-08-01", category: "Tarjetas" }],
      [], [], [], [], [], [],
    ]);
    vi.mocked(getDb).mockResolvedValue(database as never);
    const caller = appRouter.createCaller(createContext());
    const july = await caller.finance.monthlySummary({ month: "2026-07" });
    const august = await caller.finance.monthlySummary({ month: "2026-08" });

    expect(july.balances).toMatchObject({ expenses: 0, possibleExpenses: 70, confirmedBalance: 0, balanceWithPossibleIncome: -70 });
    expect(july.lines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transaction-31", source: "possible_expense", certainty: "possible" })]));
    expect(august.balances).toMatchObject({ expenses: 240, possibleExpenses: 0, confirmedBalance: -240 });
    expect(august.lines).toEqual(expect.arrayContaining([expect.objectContaining({ id: "transaction-32", source: "card_forecast", certainty: "confirmed" })]));
  });
});

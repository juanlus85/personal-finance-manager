import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
import { z } from "zod";
import {
  accountBalanceSnapshots,
  accounts,
  categories,
  currencyValues,
  debts,
  directionValues,
  exchangeRates,
  financings,
  loanFeatures,
  loanInstallments,
  loans,
  monthlyConceptSettlements,
  recurringTransactions,
  transactions,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  calculateMonthlyBalances,
  calculateMonthlySettlement,
  convertToEur,
  generateFrenchAmortizationSchedule,
  isActiveDuringMonth,
  monthBounds,
  roundMoney,
} from "../finance/calculations";
import { protectedProcedure, router } from "../_core/trpc";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD format.");
const monthSchema = z.string().regex(/^\d{4}-\d{2}$/, "Use the YYYY-MM format.");
const moneySchema = z.coerce.number().finite().positive().max(999_999_999);
const nonNegativeMoneySchema = z.coerce.number().finite().min(0).max(999_999_999);
const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const currencySchema = z.enum(currencyValues);
const directionSchema = z.enum(directionValues);

function numberValue(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

async function requireDatabase() {
  const db = await getDb();
  if (!db) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "La base de datos no está disponible en este momento.",
    });
  }
  return db;
}

function nullableValue(value: string | null | undefined) {
  return value?.trim() || null;
}

function dateKey(value: Date | string | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.toISOString().slice(0, 10);
}

function todayInSpain() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

async function assertOwnedLoan(userId: number, loanId: number) {
  const db = await requireDatabase();
  const record = await db
    .select({ id: loans.id })
    .from(loans)
    .where(and(eq(loans.id, loanId), eq(loans.userId, userId)))
    .limit(1);

  if (record.length === 0) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró el préstamo solicitado." });
  }
}

function findRateToEur(
  rates: Array<{ fromCurrency: "EUR" | "USD"; rate: string | number; effectiveOn: Date | string }>,
  currency: "EUR" | "USD",
  date: Date | string,
) {
  if (currency === "EUR") return 1;

  const normalizedDate = dateKey(date);
  const match = rates.find(rate => rate.fromCurrency === currency && dateKey(rate.effectiveOn)! <= normalizedDate!);
  return match ? numberValue(match.rate) : null;
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthSeries(endMonth: string, count: number) {
  return Array.from({ length: count }, (_, index) => shiftMonth(endMonth, index - count + 1));
}

function groupedByLabel(
  lines: Array<{ direction: "income" | "expense"; certainty: "confirmed" | "possible"; amountEur: number | null; category: string }>,
  direction: "income" | "expense",
) {
  const totals = new Map<string, number>();

  for (const line of lines) {
    if (line.direction !== direction || line.amountEur === null) continue;
    const current = totals.get(line.category) ?? 0;
    totals.set(line.category, Math.round((current + line.amountEur) * 100) / 100);
  }

  return [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((left, right) => right.amount - left.amount);
}

const categoryInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(120),
  direction: directionSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#4C7A68"),
  icon: nullableText(64),
  isActive: z.boolean().default(true),
});

const accountInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(140),
  type: z.enum(["bank", "cash", "investment", "wallet", "other"]),
  currency: currencySchema,
  institution: nullableText(140),
  includeInLiquidity: z.boolean().default(true),
  notes: nullableText(4_000),
  isActive: z.boolean().default(true),
});

const loanInput = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(160),
  lender: nullableText(160),
  currency: currencySchema.default("EUR"),
  originalPrincipal: moneySchema,
  currentPrincipal: nonNegativeMoneySchema.optional().nullable(),
  annualInterestRate: z.coerce.number().finite().min(0).max(100),
  monthlyPayment: moneySchema,
  paymentDay: z.number().int().min(1).max(31),
  startDate: dateSchema,
  endDate: dateSchema,
  amortizationMethod: z.enum(["french", "custom", "manual"]).default("french"),
  status: z.enum(["active", "archived"]).default("active"),
  notes: nullableText(4_000),
  features: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(255) })).default([]),
  regenerateSchedule: z.boolean().default(true),
});

const financingInput = z.object({
  id: z.number().int().positive().optional(),
  concept: z.string().trim().min(1).max(180),
  provider: nullableText(160),
  currency: currencySchema.default("EUR"),
  monthlyAmount: moneySchema,
  totalAmount: nonNegativeMoneySchema.optional().nullable(),
  paymentDay: z.number().int().min(1).max(31),
  startDate: dateSchema,
  endDate: dateSchema,
  status: z.enum(["active", "archived"]).default("active"),
  notes: nullableText(4_000),
});

const recurringInput = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional().nullable(),
  accountId: z.number().int().positive().optional().nullable(),
  name: z.string().trim().min(1).max(180),
  direction: directionSchema,
  kind: z.enum(["fixed_income", "recurring_bill"]),
  certainty: z.enum(["confirmed", "possible"]).default("confirmed"),
  currency: currencySchema.default("EUR"),
  amount: moneySchema,
  dayOfMonth: z.number().int().min(1).max(31),
  startDate: dateSchema,
  endDate: dateSchema.optional().nullable(),
  notes: nullableText(4_000),
  isActive: z.boolean().default(true),
});

const transactionInput = z.object({
  id: z.number().int().positive().optional(),
  categoryId: z.number().int().positive().optional().nullable(),
  accountId: z.number().int().positive().optional().nullable(),
  description: z.string().trim().min(1).max(220),
  direction: directionSchema,
  kind: z.enum(["extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]),
  certainty: z.enum(["confirmed", "possible"]).default("confirmed"),
  currency: currencySchema.default("EUR"),
  amount: moneySchema,
  exchangeRateToEur: z.coerce.number().finite().positive().max(100).optional().nullable(),
  effectiveDate: dateSchema,
  notes: nullableText(4_000),
});

const settlementInput = z.object({
  month: monthSchema,
  conceptId: z.string().regex(/^(recurring|loan|financing|transaction)-\d+$/),
  source: z.enum(["recurring", "loan", "financing", "extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]),
  description: z.string().trim().min(1).max(220),
  direction: directionSchema,
  certainty: z.enum(["confirmed", "possible"]),
  currency: currencySchema,
  plannedAmount: moneySchema,
  plannedAmountEur: z.coerce.number().finite().min(0).max(999_999_999).nullable(),
  amount: moneySchema,
  amountEur: z.coerce.number().finite().min(0).max(999_999_999).nullable(),
  accountId: z.number().int().positive(),
  settledOn: dateSchema,
});

const debtInput = z.object({
  id: z.number().int().positive().optional(),
  counterparty: z.string().trim().min(1).max(160),
  direction: z.enum(["in_favor", "against"]),
  currency: currencySchema.default("EUR"),
  amount: moneySchema,
  originatedOn: dateSchema,
  dueDate: dateSchema.optional().nullable(),
  status: z.enum(["open", "settled", "cancelled"]).default("open"),
  notes: nullableText(4_000),
});

const importedIdSchema = z.number().int().positive();
const importedDecimalSchema = z.union([z.string(), z.number()]).transform(value => Number(value)).pipe(z.number().finite().min(0).max(999_999_999));
const importedNullableText = (max: number) => z.string().max(max).nullable().optional().default(null);
const portableBackupSchema = z.object({
  format: z.literal("lumen-finanzas-export"),
  version: z.literal(1),
  data: z.object({
    categories: z.array(z.object({ id: importedIdSchema, name: z.string().min(1).max(120), direction: directionSchema, color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), icon: importedNullableText(64), isActive: z.boolean() })).max(5_000).default([]),
    accounts: z.array(z.object({ id: importedIdSchema, name: z.string().min(1).max(140), type: z.enum(["bank", "cash", "investment", "wallet", "other"]), currency: currencySchema, institution: importedNullableText(140), includeInLiquidity: z.boolean(), notes: importedNullableText(4_000), isActive: z.boolean() })).max(5_000).default([]),
    accountBalanceSnapshots: z.array(z.object({ accountId: importedIdSchema, balance: importedDecimalSchema, recordedOn: dateSchema, note: importedNullableText(255) })).max(10_000).default([]),
    exchangeRates: z.array(z.object({ fromCurrency: z.literal("USD"), toCurrency: z.literal("EUR"), rate: importedDecimalSchema.refine(value => value > 0), effectiveOn: dateSchema, note: importedNullableText(255) })).max(5_000).default([]),
    loans: z.array(z.object({ id: importedIdSchema, name: z.string().min(1).max(160), lender: importedNullableText(160), currency: currencySchema, originalPrincipal: importedDecimalSchema.refine(value => value > 0), currentPrincipal: importedDecimalSchema.nullable().optional().default(null), annualInterestRate: importedDecimalSchema.refine(value => value <= 100), monthlyPayment: importedDecimalSchema.refine(value => value > 0), paymentDay: z.number().int().min(1).max(31), startDate: dateSchema, endDate: dateSchema, amortizationMethod: z.enum(["french", "custom", "manual"]), status: z.enum(["active", "archived"]), notes: importedNullableText(4_000) })).max(5_000).default([]),
    loanFeatures: z.array(z.object({ loanId: importedIdSchema, label: z.string().min(1).max(100), value: z.string().min(1).max(255), sortOrder: z.number().int().min(0) })).max(10_000).default([]),
    loanInstallments: z.array(z.object({ loanId: importedIdSchema, installmentNumber: z.number().int().positive(), dueDate: dateSchema, totalPayment: importedDecimalSchema, principalPayment: importedDecimalSchema, interestPayment: importedDecimalSchema, remainingPrincipal: importedDecimalSchema, isPaid: z.boolean().default(false), paidOn: dateSchema.nullable().optional().default(null) })).max(20_000).default([]),
    financings: z.array(z.object({ concept: z.string().min(1).max(180), provider: importedNullableText(160), currency: currencySchema, monthlyAmount: importedDecimalSchema.refine(value => value > 0), totalAmount: importedDecimalSchema.nullable().optional().default(null), paymentDay: z.number().int().min(1).max(31), startDate: dateSchema, endDate: dateSchema, status: z.enum(["active", "archived"]), notes: importedNullableText(4_000) })).max(5_000).default([]),
    recurringTransactions: z.array(z.object({ categoryId: importedIdSchema.nullable().optional().default(null), accountId: importedIdSchema.nullable().optional().default(null), name: z.string().min(1).max(180), direction: directionSchema, kind: z.enum(["fixed_income", "recurring_bill"]), certainty: z.enum(["confirmed", "possible"]), currency: currencySchema, amount: importedDecimalSchema.refine(value => value > 0), dayOfMonth: z.number().int().min(1).max(31), startDate: dateSchema, endDate: dateSchema.nullable().optional().default(null), notes: importedNullableText(4_000), isActive: z.boolean() })).max(10_000).default([]),
    transactions: z.array(z.object({ categoryId: importedIdSchema.nullable().optional().default(null), accountId: importedIdSchema.nullable().optional().default(null), description: z.string().min(1).max(220), direction: directionSchema, kind: z.enum(["extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]), certainty: z.enum(["confirmed", "possible"]), currency: currencySchema, amount: importedDecimalSchema.refine(value => value > 0), exchangeRateToEur: importedDecimalSchema.nullable().optional().default(null), effectiveDate: dateSchema, notes: importedNullableText(4_000) })).max(20_000).default([]),
    monthlyConceptSettlements: z.array(z.object({ month: monthSchema, conceptId: z.string().min(3).max(96), source: z.enum(["recurring", "loan", "financing", "extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]), description: z.string().min(1).max(220), direction: directionSchema, certainty: z.enum(["confirmed", "possible"]), currency: currencySchema, plannedAmount: importedDecimalSchema.optional(), plannedAmountEur: importedDecimalSchema.nullable().optional().default(null), amount: importedDecimalSchema.refine(value => value > 0), amountEur: importedDecimalSchema.nullable().optional().default(null), accountId: importedIdSchema.nullable().optional().default(null), status: z.literal("settled"), settledOn: dateSchema })).max(20_000).default([]),
    debts: z.array(z.object({ counterparty: z.string().min(1).max(160), direction: z.enum(["in_favor", "against"]), currency: currencySchema, amount: importedDecimalSchema.refine(value => value > 0), originatedOn: dateSchema, dueDate: dateSchema.nullable().optional().default(null), status: z.enum(["open", "settled", "cancelled"]), notes: importedNullableText(4_000) })).max(10_000).default([]),
  }),
});

export const financeRouter = router({
  categories: router({
    list: protectedProcedure
      .input(z.object({ direction: directionSchema.optional(), includeInactive: z.boolean().default(false) }).optional())
      .query(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const direction = input?.direction;
        const includeInactive = input?.includeInactive ?? false;
        const conditions = [eq(categories.userId, ctx.user.id)];
        if (direction) conditions.push(eq(categories.direction, direction));
        if (!includeInactive) conditions.push(eq(categories.isActive, true));
        return db.select().from(categories).where(and(...conditions)).orderBy(asc(categories.name));
      }),
    save: protectedProcedure.input(categoryInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const values = {
        name: input.name,
        direction: input.direction,
        color: input.color,
        icon: nullableValue(input.icon),
        isActive: input.isActive,
      };

      if (input.id) {
        await db.update(categories).set(values).where(and(eq(categories.id, input.id), eq(categories.userId, ctx.user.id)));
      } else {
        await db.insert(categories).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
  }),

  accounts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(accounts).where(eq(accounts.userId, ctx.user.id)).orderBy(asc(accounts.name));
    }),
    save: protectedProcedure.input(accountInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const values = {
        name: input.name,
        type: input.type,
        currency: input.currency,
        institution: nullableValue(input.institution),
        includeInLiquidity: input.includeInLiquidity,
        notes: nullableValue(input.notes),
        isActive: input.isActive,
      };
      if (input.id) {
        await db.update(accounts).set(values).where(and(eq(accounts.id, input.id), eq(accounts.userId, ctx.user.id)));
      } else {
        await db.insert(accounts).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
    saveBalance: protectedProcedure
      .input(z.object({ accountId: z.number().int().positive(), balance: z.coerce.number().finite(), recordedOn: dateSchema, note: nullableText(255) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const account = await db.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id))).limit(1);
        if (account.length === 0) throw new TRPCError({ code: "NOT_FOUND", message: "No se encontró la cuenta." });
        await db.insert(accountBalanceSnapshots).values({
          accountId: input.accountId,
          balance: input.balance.toFixed(2),
          recordedOn: input.recordedOn,
          note: nullableValue(input.note),
        }).onDuplicateKeyUpdate({
          set: { balance: input.balance.toFixed(2), note: nullableValue(input.note) },
        });
        return { success: true };
      }),
  }),

  exchangeRates: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(exchangeRates).where(eq(exchangeRates.userId, ctx.user.id)).orderBy(desc(exchangeRates.effectiveOn));
    }),
    save: protectedProcedure
      .input(z.object({ id: z.number().int().positive().optional(), fromCurrency: z.literal("USD"), rate: z.coerce.number().finite().positive().max(100), effectiveOn: dateSchema, note: nullableText(255) }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDatabase();
        const values = { fromCurrency: input.fromCurrency, toCurrency: "EUR" as const, rate: input.rate.toFixed(8), effectiveOn: input.effectiveOn, note: nullableValue(input.note) };
        if (input.id) {
          await db.update(exchangeRates).set(values).where(and(eq(exchangeRates.id, input.id), eq(exchangeRates.userId, ctx.user.id)));
        } else {
          await db.insert(exchangeRates).values({ ...values, userId: ctx.user.id });
        }
        return { success: true };
      }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.delete(exchangeRates).where(and(eq(exchangeRates.id, input.id), eq(exchangeRates.userId, ctx.user.id)));
      return { success: true };
    }),
  }),

  loans: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      const loanRows = await db.select().from(loans).where(eq(loans.userId, ctx.user.id)).orderBy(desc(loans.endDate));
      if (loanRows.length === 0) return [];
      const featureRows = await db.select().from(loanFeatures).where(inArray(loanFeatures.loanId, loanRows.map(loan => loan.id))).orderBy(asc(loanFeatures.sortOrder));
      return loanRows.map(loan => ({ ...loan, features: featureRows.filter(feature => feature.loanId === loan.id) }));
    }),
    save: protectedProcedure.input(loanInput).mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha de finalización no puede ser anterior al inicio." });
      }
      const db = await requireDatabase();
      const values = {
        name: input.name,
        lender: nullableValue(input.lender),
        currency: input.currency,
        originalPrincipal: input.originalPrincipal.toFixed(2),
        currentPrincipal: input.currentPrincipal === null || input.currentPrincipal === undefined ? null : input.currentPrincipal.toFixed(2),
        annualInterestRate: input.annualInterestRate.toFixed(5),
        monthlyPayment: input.monthlyPayment.toFixed(2),
        paymentDay: input.paymentDay,
        startDate: input.startDate,
        endDate: input.endDate,
        amortizationMethod: input.amortizationMethod,
        status: input.status,
        notes: nullableValue(input.notes),
      };

      let loanId = input.id;
      if (loanId) {
        await assertOwnedLoan(ctx.user.id, loanId);
        await db.update(loans).set(values).where(and(eq(loans.id, loanId), eq(loans.userId, ctx.user.id)));
      } else {
        const result = await db.insert(loans).values({ ...values, userId: ctx.user.id });
        loanId = Number(result[0].insertId);
      }

      await db.delete(loanFeatures).where(eq(loanFeatures.loanId, loanId));
      if (input.features.length > 0) {
        await db.insert(loanFeatures).values(input.features.map((feature, sortOrder) => ({ loanId: loanId!, label: feature.label, value: feature.value, sortOrder })));
      }

      if (input.amortizationMethod === "french" && input.regenerateSchedule) {
        const schedule = generateFrenchAmortizationSchedule({
          principal: input.currentPrincipal ?? input.originalPrincipal,
          annualInterestRate: input.annualInterestRate,
          monthlyPayment: input.monthlyPayment,
          startDate: input.startDate,
          endDate: input.endDate,
          paymentDay: input.paymentDay,
        });
        await db.delete(loanInstallments).where(eq(loanInstallments.loanId, loanId));
        if (schedule.length > 0) {
          await db.insert(loanInstallments).values(schedule.map(item => ({
            loanId: loanId!,
            installmentNumber: item.installmentNumber,
            dueDate: item.dueDate,
            totalPayment: item.totalPayment.toFixed(2),
            principalPayment: item.principalPayment.toFixed(2),
            interestPayment: item.interestPayment.toFixed(2),
            remainingPrincipal: item.remainingPrincipal.toFixed(2),
          })));
        }
      }
      return { success: true, id: loanId };
    }),
    installments: protectedProcedure.input(z.object({ loanId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      await assertOwnedLoan(ctx.user.id, input.loanId);
      const db = await requireDatabase();
      return db.select().from(loanInstallments).where(eq(loanInstallments.loanId, input.loanId)).orderBy(asc(loanInstallments.dueDate));
    }),
    saveInstallment: protectedProcedure.input(z.object({
      id: z.number().int().positive().optional(),
      loanId: z.number().int().positive(),
      installmentNumber: z.number().int().positive(),
      dueDate: dateSchema,
      totalPayment: moneySchema,
      principalPayment: nonNegativeMoneySchema,
      interestPayment: nonNegativeMoneySchema,
      remainingPrincipal: nonNegativeMoneySchema,
      isPaid: z.boolean().default(false),
      paidOn: dateSchema.optional().nullable(),
    })).mutation(async ({ ctx, input }) => {
      await assertOwnedLoan(ctx.user.id, input.loanId);
      const db = await requireDatabase();
      const values = {
        loanId: input.loanId,
        installmentNumber: input.installmentNumber,
        dueDate: input.dueDate,
        totalPayment: input.totalPayment.toFixed(2),
        principalPayment: input.principalPayment.toFixed(2),
        interestPayment: input.interestPayment.toFixed(2),
        remainingPrincipal: input.remainingPrincipal.toFixed(2),
        isPaid: input.isPaid,
        paidOn: input.paidOn ?? null,
      };
      if (input.id) {
        await db.update(loanInstallments).set(values).where(and(eq(loanInstallments.id, input.id), eq(loanInstallments.loanId, input.loanId)));
      } else {
        await db.insert(loanInstallments).values(values);
      }
      return { success: true };
    }),
  }),

  financings: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(financings).where(eq(financings.userId, ctx.user.id)).orderBy(desc(financings.endDate));
    }),
    save: protectedProcedure.input(financingInput).mutation(async ({ ctx, input }) => {
      if (input.endDate < input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha de finalización no puede ser anterior al inicio." });
      const db = await requireDatabase();
      const values = {
        concept: input.concept,
        provider: nullableValue(input.provider),
        currency: input.currency,
        monthlyAmount: input.monthlyAmount.toFixed(2),
        totalAmount: input.totalAmount === null || input.totalAmount === undefined ? null : input.totalAmount.toFixed(2),
        paymentDay: input.paymentDay,
        startDate: input.startDate,
        endDate: input.endDate,
        status: input.status,
        notes: nullableValue(input.notes),
      };
      if (input.id) {
        await db.update(financings).set(values).where(and(eq(financings.id, input.id), eq(financings.userId, ctx.user.id)));
      } else {
        await db.insert(financings).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
  }),

  recurring: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select({
        id: recurringTransactions.id,
        categoryId: recurringTransactions.categoryId,
        accountId: recurringTransactions.accountId,
        name: recurringTransactions.name,
        direction: recurringTransactions.direction,
        kind: recurringTransactions.kind,
        certainty: recurringTransactions.certainty,
        currency: recurringTransactions.currency,
        amount: recurringTransactions.amount,
        dayOfMonth: recurringTransactions.dayOfMonth,
        startDate: recurringTransactions.startDate,
        endDate: recurringTransactions.endDate,
        notes: recurringTransactions.notes,
        isActive: recurringTransactions.isActive,
        categoryName: categories.name,
      }).from(recurringTransactions).leftJoin(categories, eq(recurringTransactions.categoryId, categories.id)).where(eq(recurringTransactions.userId, ctx.user.id)).orderBy(asc(recurringTransactions.name));
    }),
    save: protectedProcedure.input(recurringInput).mutation(async ({ ctx, input }) => {
      if (input.endDate && input.endDate < input.startDate) throw new TRPCError({ code: "BAD_REQUEST", message: "La fecha de finalización no puede ser anterior al inicio." });
      const db = await requireDatabase();
      const values = {
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        name: input.name,
        direction: input.direction,
        kind: input.kind,
        certainty: input.direction === "expense" ? "confirmed" as const : input.certainty,
        currency: input.currency,
        amount: input.amount.toFixed(2),
        dayOfMonth: input.dayOfMonth,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        notes: nullableValue(input.notes),
        isActive: input.isActive,
      };
      if (input.id) {
        await db.update(recurringTransactions).set(values).where(and(eq(recurringTransactions.id, input.id), eq(recurringTransactions.userId, ctx.user.id)));
      } else {
        await db.insert(recurringTransactions).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
  }),

  transactions: router({
    list: protectedProcedure.input(z.object({ month: monthSchema.optional(), kind: z.enum(["extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const conditions = [eq(transactions.userId, ctx.user.id)];
      if (input?.month) {
        const bounds = monthBounds(input.month);
        conditions.push(gte(transactions.effectiveDate, bounds.start), lte(transactions.effectiveDate, bounds.end));
      }
      if (input?.kind) conditions.push(eq(transactions.kind, input.kind));
      return db.select({
        id: transactions.id,
        categoryId: transactions.categoryId,
        accountId: transactions.accountId,
        description: transactions.description,
        direction: transactions.direction,
        kind: transactions.kind,
        certainty: transactions.certainty,
        currency: transactions.currency,
        amount: transactions.amount,
        exchangeRateToEur: transactions.exchangeRateToEur,
        effectiveDate: transactions.effectiveDate,
        notes: transactions.notes,
        categoryName: categories.name,
        categoryColor: categories.color,
      }).from(transactions).leftJoin(categories, eq(transactions.categoryId, categories.id)).where(and(...conditions)).orderBy(desc(transactions.effectiveDate), desc(transactions.id));
    }),
    save: protectedProcedure.input(transactionInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const certainty = input.kind === "possible_income" || input.kind === "possible_expense" ? "possible" : input.direction === "expense" ? "confirmed" : input.certainty;
      const values = {
        categoryId: input.categoryId ?? null,
        accountId: input.accountId ?? null,
        description: input.description,
        direction: input.direction,
        kind: input.kind,
        certainty,
        currency: input.currency,
        amount: input.amount.toFixed(2),
        exchangeRateToEur: input.currency === "EUR" ? null : input.exchangeRateToEur?.toFixed(8) ?? null,
        effectiveDate: input.effectiveDate,
        notes: nullableValue(input.notes),
      };
      if (input.id) {
        await db.update(transactions).set(values).where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)));
      } else {
        await db.insert(transactions).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      await db.delete(transactions).where(and(eq(transactions.id, input.id), eq(transactions.userId, ctx.user.id)));
      return { success: true };
    }),
  }),

  settlements: router({
    settle: protectedProcedure.input(settlementInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const targetAccount = await db
        .select({ id: accounts.id, currency: accounts.currency })
        .from(accounts)
        .where(and(eq(accounts.id, input.accountId), eq(accounts.userId, ctx.user.id), eq(accounts.isActive, true)))
        .limit(1);

      if (targetAccount.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "La cuenta seleccionada no está disponible." });
      }
      if (targetAccount[0].currency !== input.currency) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "La cuenta debe tener la misma moneda que el concepto liquidado." });
      }

      const values = {
        userId: ctx.user.id,
        month: input.month,
        conceptId: input.conceptId,
        source: input.source,
        description: input.description,
        direction: input.direction,
        certainty: input.certainty,
        currency: input.currency,
        plannedAmount: input.plannedAmount.toFixed(2),
        plannedAmountEur: input.plannedAmountEur === null ? null : input.plannedAmountEur.toFixed(2),
        amount: input.amount.toFixed(2),
        amountEur: input.amountEur === null ? null : input.amountEur.toFixed(2),
        accountId: input.accountId,
        status: "settled" as const,
        settledOn: input.settledOn,
      };

      const snapshotDate = todayInSpain();
      await db.transaction(async tx => {
        const applyAccountDelta = async (accountId: number, delta: number) => {
          if (delta === 0) return;
          const latestSnapshot = await tx
            .select({ balance: accountBalanceSnapshots.balance })
            .from(accountBalanceSnapshots)
            .where(eq(accountBalanceSnapshots.accountId, accountId))
            .orderBy(desc(accountBalanceSnapshots.recordedOn), desc(accountBalanceSnapshots.id))
            .limit(1);
          const nextBalance = roundMoney(numberValue(latestSnapshot[0]?.balance) + delta);
          await tx.insert(accountBalanceSnapshots).values({
            accountId,
            balance: nextBalance.toFixed(2),
            recordedOn: snapshotDate,
            note: "Actualizado al liquidar un cobro o pago",
          }).onDuplicateKeyUpdate({
            set: {
              balance: nextBalance.toFixed(2),
              note: "Actualizado al liquidar un cobro o pago",
            },
          });
        };

        const previous = await tx
          .select({ accountId: monthlyConceptSettlements.accountId, direction: monthlyConceptSettlements.direction, amount: monthlyConceptSettlements.amount })
          .from(monthlyConceptSettlements)
          .where(and(
            eq(monthlyConceptSettlements.userId, ctx.user.id),
            eq(monthlyConceptSettlements.month, input.month),
            eq(monthlyConceptSettlements.conceptId, input.conceptId),
          ))
          .limit(1);

        if (previous[0]?.accountId !== null && previous[0]?.accountId !== undefined) {
          const reversal = previous[0].direction === "income" ? -numberValue(previous[0].amount) : numberValue(previous[0].amount);
          await applyAccountDelta(previous[0].accountId, reversal);
        }

        await tx.insert(monthlyConceptSettlements).values(values).onDuplicateKeyUpdate({
          set: {
            source: values.source,
            description: values.description,
            direction: values.direction,
            certainty: values.certainty,
            currency: values.currency,
            plannedAmount: values.plannedAmount,
            plannedAmountEur: values.plannedAmountEur,
            amount: values.amount,
            amountEur: values.amountEur,
            accountId: values.accountId,
            status: values.status,
            settledOn: values.settledOn,
          },
        });

        await applyAccountDelta(input.accountId, input.direction === "income" ? input.amount : -input.amount);
      });
      return { success: true };
    }),
    undo: protectedProcedure.input(z.object({ month: monthSchema, conceptId: z.string().min(3).max(96) })).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const snapshotDate = todayInSpain();
      await db.transaction(async tx => {
        const existing = await tx
          .select({ accountId: monthlyConceptSettlements.accountId, direction: monthlyConceptSettlements.direction, amount: monthlyConceptSettlements.amount })
          .from(monthlyConceptSettlements)
          .where(and(
            eq(monthlyConceptSettlements.userId, ctx.user.id),
            eq(monthlyConceptSettlements.month, input.month),
            eq(monthlyConceptSettlements.conceptId, input.conceptId),
          ))
          .limit(1);

        if (existing[0]?.accountId !== null && existing[0]?.accountId !== undefined) {
          const latestSnapshot = await tx
            .select({ balance: accountBalanceSnapshots.balance })
            .from(accountBalanceSnapshots)
            .where(eq(accountBalanceSnapshots.accountId, existing[0].accountId))
            .orderBy(desc(accountBalanceSnapshots.recordedOn), desc(accountBalanceSnapshots.id))
            .limit(1);
          const reversal = existing[0].direction === "income" ? -numberValue(existing[0].amount) : numberValue(existing[0].amount);
          const nextBalance = roundMoney(numberValue(latestSnapshot[0]?.balance) + reversal);
          await tx.insert(accountBalanceSnapshots).values({
            accountId: existing[0].accountId,
            balance: nextBalance.toFixed(2),
            recordedOn: snapshotDate,
            note: "Actualizado al deshacer una liquidación",
          }).onDuplicateKeyUpdate({
            set: {
              balance: nextBalance.toFixed(2),
              note: "Actualizado al deshacer una liquidación",
            },
          });
        }

        await tx.delete(monthlyConceptSettlements).where(and(
          eq(monthlyConceptSettlements.userId, ctx.user.id),
          eq(monthlyConceptSettlements.month, input.month),
          eq(monthlyConceptSettlements.conceptId, input.conceptId),
        ));
      });
      return { success: true };
    }),
  }),

  debts: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDatabase();
      return db.select().from(debts).where(eq(debts.userId, ctx.user.id)).orderBy(asc(debts.status), desc(debts.originatedOn));
    }),
    save: protectedProcedure.input(debtInput).mutation(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const values = {
        counterparty: input.counterparty,
        direction: input.direction,
        currency: input.currency,
        amount: input.amount.toFixed(2),
        originatedOn: input.originatedOn,
        dueDate: input.dueDate ?? null,
        status: input.status,
        notes: nullableValue(input.notes),
      };
      if (input.id) {
        await db.update(debts).set(values).where(and(eq(debts.id, input.id), eq(debts.userId, ctx.user.id)));
      } else {
        await db.insert(debts).values({ ...values, userId: ctx.user.id });
      }
      return { success: true };
    }),
  }),

  monthlySummary: protectedProcedure.input(z.object({ month: monthSchema })).query(async ({ ctx, input }) => {
    const db = await requireDatabase();
    const { start, end } = monthBounds(input.month);

    const [recurringRows, loanRows, financingRows, transactionRows, rateRows, accountRows, snapshotRows, debtRows, monthSettlementRows, accountSettlementRows] = await Promise.all([
      db.select({
        id: recurringTransactions.id,
        accountId: recurringTransactions.accountId,
        name: recurringTransactions.name,
        direction: recurringTransactions.direction,
        certainty: recurringTransactions.certainty,
        currency: recurringTransactions.currency,
        amount: recurringTransactions.amount,
        category: categories.name,
        startDate: recurringTransactions.startDate,
        endDate: recurringTransactions.endDate,
      }).from(recurringTransactions).leftJoin(categories, eq(recurringTransactions.categoryId, categories.id)).where(and(
        eq(recurringTransactions.userId, ctx.user.id),
        eq(recurringTransactions.isActive, true),
        lte(recurringTransactions.startDate, end),
        or(isNull(recurringTransactions.endDate), gte(recurringTransactions.endDate, start)),
      )),
      db.select().from(loans).where(and(eq(loans.userId, ctx.user.id), eq(loans.status, "active"), lte(loans.startDate, end), gte(loans.endDate, start))),
      db.select().from(financings).where(and(eq(financings.userId, ctx.user.id), eq(financings.status, "active"), lte(financings.startDate, end), gte(financings.endDate, start))),
      db.select({
        id: transactions.id,
        accountId: transactions.accountId,
        description: transactions.description,
        direction: transactions.direction,
        certainty: transactions.certainty,
        kind: transactions.kind,
        currency: transactions.currency,
        amount: transactions.amount,
        exchangeRateToEur: transactions.exchangeRateToEur,
        effectiveDate: transactions.effectiveDate,
        category: categories.name,
      }).from(transactions).leftJoin(categories, eq(transactions.categoryId, categories.id)).where(and(eq(transactions.userId, ctx.user.id), gte(transactions.effectiveDate, start), lte(transactions.effectiveDate, end))),
      db.select({ fromCurrency: exchangeRates.fromCurrency, rate: exchangeRates.rate, effectiveOn: exchangeRates.effectiveOn }).from(exchangeRates).where(and(eq(exchangeRates.userId, ctx.user.id), lte(exchangeRates.effectiveOn, end))).orderBy(desc(exchangeRates.effectiveOn)),
      db.select().from(accounts).where(and(eq(accounts.userId, ctx.user.id), eq(accounts.isActive, true))).orderBy(asc(accounts.name)),
      db.select({
        id: accountBalanceSnapshots.id,
        accountId: accountBalanceSnapshots.accountId,
        balance: accountBalanceSnapshots.balance,
        recordedOn: accountBalanceSnapshots.recordedOn,
        note: accountBalanceSnapshots.note,
      }).from(accountBalanceSnapshots).innerJoin(accounts, eq(accountBalanceSnapshots.accountId, accounts.id)).where(eq(accounts.userId, ctx.user.id)).orderBy(desc(accountBalanceSnapshots.recordedOn)),
      db.select().from(debts).where(and(eq(debts.userId, ctx.user.id), eq(debts.status, "open"))).orderBy(desc(debts.originatedOn)),
      db.select().from(monthlyConceptSettlements).where(and(eq(monthlyConceptSettlements.userId, ctx.user.id), eq(monthlyConceptSettlements.month, input.month))),
      db.select().from(monthlyConceptSettlements).where(and(eq(monthlyConceptSettlements.userId, ctx.user.id), eq(monthlyConceptSettlements.status, "settled"))),
    ]);

    const relevantSnapshots = snapshotRows.filter(snapshot => dateKey(snapshot.recordedOn)! <= end);
    const latestSnapshotByAccount = new Map<number, typeof relevantSnapshots[number]>();
    for (const snapshot of relevantSnapshots) {
      if (!latestSnapshotByAccount.has(snapshot.accountId)) latestSnapshotByAccount.set(snapshot.accountId, snapshot);
    }
    const settlementByConcept = new Map(monthSettlementRows.map(settlement => [settlement.conceptId, settlement]));

    const lines = [
      ...recurringRows.filter(row => isActiveDuringMonth(dateKey(row.startDate)!, dateKey(row.endDate), input.month)).map(row => {
        const rate = findRateToEur(rateRows, row.currency, end);
        return {
          id: `recurring-${row.id}`,
          source: "recurring",
          defaultAccountId: row.accountId ?? null,
          description: row.name,
          direction: row.direction,
          certainty: row.certainty,
          amount: numberValue(row.amount),
          currency: row.currency,
          amountEur: convertToEur(numberValue(row.amount), row.currency, rate),
          category: row.category ?? (row.direction === "expense" ? "Recibos habituales" : "Ingresos fijos"),
        };
      }),
      ...loanRows.map(row => {
        const rate = findRateToEur(rateRows, row.currency, end);
        return {
          id: `loan-${row.id}`,
          source: "loan",
          defaultAccountId: null,
          description: row.name,
          direction: "expense" as const,
          certainty: "confirmed" as const,
          amount: numberValue(row.monthlyPayment),
          currency: row.currency,
          amountEur: convertToEur(numberValue(row.monthlyPayment), row.currency, rate),
          category: "Préstamos",
        };
      }),
      ...financingRows.map(row => {
        const rate = findRateToEur(rateRows, row.currency, end);
        return {
          id: `financing-${row.id}`,
          source: "financing",
          defaultAccountId: null,
          description: row.concept,
          direction: "expense" as const,
          certainty: "confirmed" as const,
          amount: numberValue(row.monthlyAmount),
          currency: row.currency,
          amountEur: convertToEur(numberValue(row.monthlyAmount), row.currency, rate),
          category: "Financiaciones",
        };
      }),
      ...transactionRows.map(row => {
        const rate = row.exchangeRateToEur ? numberValue(row.exchangeRateToEur) : findRateToEur(rateRows, row.currency, row.effectiveDate);
        return {
          id: `transaction-${row.id}`,
          source: row.kind,
          defaultAccountId: row.accountId ?? null,
          description: row.description,
          direction: row.direction,
          certainty: row.certainty,
          amount: numberValue(row.amount),
          currency: row.currency,
          amountEur: convertToEur(numberValue(row.amount), row.currency, rate),
          category: row.category ?? (row.direction === "expense" ? "Otros gastos" : "Otros ingresos"),
        };
      }),
    ];

    const reconciledLines = lines.map(line => {
      const settlement = settlementByConcept.get(line.id);
      return {
        ...line,
        settlementStatus: settlement?.status === "settled" ? "settled" as const : "pending" as const,
        settlementId: settlement?.id ?? null,
        settlementAccountId: settlement?.accountId ?? null,
        settledOn: dateKey(settlement?.settledOn),
        plannedAmount: settlement?.plannedAmount === null || settlement?.plannedAmount === undefined ? line.amount : numberValue(settlement.plannedAmount),
        plannedAmountEur: settlement?.plannedAmountEur === null || settlement?.plannedAmountEur === undefined ? line.amountEur : numberValue(settlement.plannedAmountEur),
        settledAmount: settlement ? numberValue(settlement.amount) : null,
        settledAmountEur: settlement?.amountEur === null || settlement?.amountEur === undefined ? null : numberValue(settlement.amountEur),
      };
    });

    const balances = calculateMonthlyBalances(lines);
    const settlement = calculateMonthlySettlement(reconciledLines);
    const accountLiquidity = accountRows.map(account => {
      const snapshot = latestSnapshotByAccount.get(account.id);
      const snapshotDate = dateKey(snapshot?.recordedOn);
      const postSnapshotSettlements = accountSettlementRows.filter(entry => {
        const settledOn = dateKey(entry.settledOn);
        return entry.accountId === account.id && settledOn !== null && settledOn <= end && (!snapshotDate || settledOn > snapshotDate);
      });
      const totalSettlementChange = postSnapshotSettlements.reduce((total, entry) => total + (entry.direction === "income" ? numberValue(entry.amount) : -numberValue(entry.amount)), 0);
      const currentMonthChange = accountSettlementRows
        .filter(entry => entry.accountId === account.id && dateKey(entry.settledOn)?.startsWith(input.month))
        .reduce((total, entry) => total + (entry.direction === "income" ? numberValue(entry.amount) : -numberValue(entry.amount)), 0);
      const amount = snapshot ? roundMoney(numberValue(snapshot.balance) + totalSettlementChange) : null;
      const rate = findRateToEur(rateRows, account.currency, end);
      return {
        id: account.id,
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: amount,
        balanceEur: amount === null ? null : convertToEur(amount, account.currency, rate),
        recordedOn: dateKey(snapshot?.recordedOn),
        included: account.includeInLiquidity,
        openingBalance: snapshot ? numberValue(snapshot.balance) : null,
        settlementChange: roundMoney(currentMonthChange),
      };
    });
    const availableLiquidity = roundMoney(accountLiquidity.filter(account => account.included).reduce((total, account) => total + Number(account.balanceEur ?? 0), 0));

    const debtSummary = debtRows.map(debt => {
      const amount = numberValue(debt.amount);
      return {
        id: debt.id,
        counterparty: debt.counterparty,
        direction: debt.direction,
        currency: debt.currency,
        amount,
        amountEur: convertToEur(amount, debt.currency, findRateToEur(rateRows, debt.currency, debt.originatedOn)),
        dueDate: debt.dueDate,
      };
    });

    return {
      month: input.month,
      bounds: { start, end },
      balances,
      settlement,
      availableLiquidity,
      lines: reconciledLines,
      expenseBreakdown: groupedByLabel(lines, "expense"),
      incomeBreakdown: groupedByLabel(lines, "income"),
      accountLiquidity,
      debts: debtSummary,
      activeLoans: loanRows.length,
      activeFinancings: financingRows.length,
    };
  }),

  monthlyTrend: protectedProcedure
    .input(z.object({ endMonth: monthSchema, count: z.number().int().min(3).max(24).default(12) }))
    .query(async ({ ctx, input }) => {
      const db = await requireDatabase();
      const months = monthSeries(input.endMonth, input.count);
      const rangeStart = monthBounds(months[0]).start;
      const rangeEnd = monthBounds(input.endMonth).end;
      const [recurringRows, loanRows, financingRows, transactionRows, rateRows] = await Promise.all([
        db.select({
          id: recurringTransactions.id,
          direction: recurringTransactions.direction,
          certainty: recurringTransactions.certainty,
          currency: recurringTransactions.currency,
          amount: recurringTransactions.amount,
          startDate: recurringTransactions.startDate,
          endDate: recurringTransactions.endDate,
        }).from(recurringTransactions).where(and(
          eq(recurringTransactions.userId, ctx.user.id),
          eq(recurringTransactions.isActive, true),
          lte(recurringTransactions.startDate, rangeEnd),
          or(isNull(recurringTransactions.endDate), gte(recurringTransactions.endDate, rangeStart)),
        )),
        db.select().from(loans).where(and(eq(loans.userId, ctx.user.id), eq(loans.status, "active"), lte(loans.startDate, rangeEnd), gte(loans.endDate, rangeStart))),
        db.select().from(financings).where(and(eq(financings.userId, ctx.user.id), eq(financings.status, "active"), lte(financings.startDate, rangeEnd), gte(financings.endDate, rangeStart))),
        db.select().from(transactions).where(and(eq(transactions.userId, ctx.user.id), gte(transactions.effectiveDate, rangeStart), lte(transactions.effectiveDate, rangeEnd))),
        db.select({ fromCurrency: exchangeRates.fromCurrency, rate: exchangeRates.rate, effectiveOn: exchangeRates.effectiveOn }).from(exchangeRates).where(and(eq(exchangeRates.userId, ctx.user.id), lte(exchangeRates.effectiveOn, rangeEnd))).orderBy(desc(exchangeRates.effectiveOn)),
      ]);

      return months.map(month => {
        const { end } = monthBounds(month);
        const lines = [
          ...recurringRows.filter(row => isActiveDuringMonth(row.startDate, row.endDate, month)).map(row => ({
            direction: row.direction,
            certainty: row.certainty,
            amountEur: convertToEur(numberValue(row.amount), row.currency, findRateToEur(rateRows, row.currency, end)),
          })),
          ...loanRows.filter(row => isActiveDuringMonth(row.startDate, row.endDate, month)).map(row => ({
            direction: "expense" as const,
            certainty: "confirmed" as const,
            amountEur: convertToEur(numberValue(row.monthlyPayment), row.currency, findRateToEur(rateRows, row.currency, end)),
          })),
          ...financingRows.filter(row => isActiveDuringMonth(row.startDate, row.endDate, month)).map(row => ({
            direction: "expense" as const,
            certainty: "confirmed" as const,
            amountEur: convertToEur(numberValue(row.monthlyAmount), row.currency, findRateToEur(rateRows, row.currency, end)),
          })),
          ...transactionRows.filter(row => row.effectiveDate.startsWith(month)).map(row => ({
            direction: row.direction,
            certainty: row.certainty,
            amountEur: convertToEur(numberValue(row.amount), row.currency, row.exchangeRateToEur ? numberValue(row.exchangeRateToEur) : findRateToEur(rateRows, row.currency, row.effectiveDate)),
          })),
        ];
        return { month, ...calculateMonthlyBalances(lines) };
      });
    }),

  exportData: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDatabase();
    const [
      categoryRows,
      accountRows,
      accountBalanceRows,
      rateRows,
      loanRows,
      loanFeatureRows,
      loanInstallmentRows,
      financingRows,
      recurringRows,
      transactionRows,
      settlementRows,
      debtRows,
    ] = await Promise.all([
      db.select().from(categories).where(eq(categories.userId, ctx.user.id)).orderBy(asc(categories.name)),
      db.select().from(accounts).where(eq(accounts.userId, ctx.user.id)).orderBy(asc(accounts.name)),
      db.select({
        id: accountBalanceSnapshots.id,
        accountId: accountBalanceSnapshots.accountId,
        balance: accountBalanceSnapshots.balance,
        recordedOn: accountBalanceSnapshots.recordedOn,
        note: accountBalanceSnapshots.note,
      }).from(accountBalanceSnapshots).innerJoin(accounts, eq(accountBalanceSnapshots.accountId, accounts.id)).where(eq(accounts.userId, ctx.user.id)).orderBy(desc(accountBalanceSnapshots.recordedOn)),
      db.select().from(exchangeRates).where(eq(exchangeRates.userId, ctx.user.id)).orderBy(desc(exchangeRates.effectiveOn)),
      db.select().from(loans).where(eq(loans.userId, ctx.user.id)).orderBy(asc(loans.name)),
      db.select({
        id: loanFeatures.id,
        loanId: loanFeatures.loanId,
        label: loanFeatures.label,
        value: loanFeatures.value,
        sortOrder: loanFeatures.sortOrder,
      }).from(loanFeatures).innerJoin(loans, eq(loanFeatures.loanId, loans.id)).where(eq(loans.userId, ctx.user.id)).orderBy(asc(loanFeatures.sortOrder)),
      db.select({
        id: loanInstallments.id,
        loanId: loanInstallments.loanId,
        installmentNumber: loanInstallments.installmentNumber,
        dueDate: loanInstallments.dueDate,
        totalPayment: loanInstallments.totalPayment,
        principalPayment: loanInstallments.principalPayment,
        interestPayment: loanInstallments.interestPayment,
        remainingPrincipal: loanInstallments.remainingPrincipal,
        isPaid: loanInstallments.isPaid,
        paidOn: loanInstallments.paidOn,
      }).from(loanInstallments).innerJoin(loans, eq(loanInstallments.loanId, loans.id)).where(eq(loans.userId, ctx.user.id)).orderBy(asc(loanInstallments.dueDate)),
      db.select().from(financings).where(eq(financings.userId, ctx.user.id)).orderBy(asc(financings.concept)),
      db.select().from(recurringTransactions).where(eq(recurringTransactions.userId, ctx.user.id)).orderBy(asc(recurringTransactions.name)),
      db.select().from(transactions).where(eq(transactions.userId, ctx.user.id)).orderBy(desc(transactions.effectiveDate)),
      db.select().from(monthlyConceptSettlements).where(eq(monthlyConceptSettlements.userId, ctx.user.id)).orderBy(desc(monthlyConceptSettlements.settledOn)),
      db.select().from(debts).where(eq(debts.userId, ctx.user.id)).orderBy(desc(debts.originatedOn)),
    ]);

    return {
      format: "lumen-finanzas-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      baseCurrency: "EUR",
      data: {
        categories: categoryRows,
        accounts: accountRows,
        accountBalanceSnapshots: accountBalanceRows,
        exchangeRates: rateRows,
        loans: loanRows,
        loanFeatures: loanFeatureRows,
        loanInstallments: loanInstallmentRows,
        financings: financingRows,
        recurringTransactions: recurringRows,
        transactions: transactionRows,
        monthlyConceptSettlements: settlementRows,
        debts: debtRows,
      },
    };
  }),

  importData: protectedProcedure.input(z.object({ backup: z.unknown() })).mutation(async ({ ctx, input }) => {
    const parsedBackup = portableBackupSchema.safeParse(input.backup);
    if (!parsedBackup.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "El archivo no tiene el formato de copia de seguridad esperado." });
    }
    const db = await requireDatabase();
    const backup = parsedBackup.data.data;

    return db.transaction(async tx => {
      const [existingCategories, existingAccounts] = await Promise.all([
        tx.select().from(categories).where(eq(categories.userId, ctx.user.id)),
        tx.select().from(accounts).where(eq(accounts.userId, ctx.user.id)),
      ]);
      const categoryByKey = new Map(existingCategories.map(category => [`${category.direction}:${category.name.toLowerCase()}`, category.id]));
      const accountByKey = new Map(existingAccounts.map(account => [`${account.currency}:${account.name.toLowerCase()}`, account.id]));
      const categoryIdMap = new Map<number, number>();
      const accountIdMap = new Map<number, number>();
      const loanIdMap = new Map<number, number>();
      let createdCategories = 0;
      let createdAccounts = 0;

      for (const category of backup.categories) {
        const key = `${category.direction}:${category.name.toLowerCase()}`;
        let targetId = categoryByKey.get(key);
        if (!targetId) {
          const result = await tx.insert(categories).values({ userId: ctx.user.id, name: category.name, direction: category.direction, color: category.color, icon: category.icon, isActive: category.isActive });
          targetId = Number(result[0].insertId);
          categoryByKey.set(key, targetId);
          createdCategories += 1;
        }
        categoryIdMap.set(category.id, targetId);
      }

      for (const account of backup.accounts) {
        const key = `${account.currency}:${account.name.toLowerCase()}`;
        let targetId = accountByKey.get(key);
        if (!targetId) {
          const result = await tx.insert(accounts).values({ userId: ctx.user.id, name: account.name, type: account.type, currency: account.currency, institution: account.institution, includeInLiquidity: account.includeInLiquidity, notes: account.notes, isActive: account.isActive });
          targetId = Number(result[0].insertId);
          accountByKey.set(key, targetId);
          createdAccounts += 1;
        }
        accountIdMap.set(account.id, targetId);
      }

      for (const snapshot of backup.accountBalanceSnapshots) {
        const accountId = accountIdMap.get(snapshot.accountId);
        if (!accountId) continue;
        await tx.insert(accountBalanceSnapshots).values({ accountId, balance: snapshot.balance.toFixed(2), recordedOn: snapshot.recordedOn, note: snapshot.note }).onDuplicateKeyUpdate({ set: { balance: snapshot.balance.toFixed(2), note: snapshot.note } });
      }
      for (const rate of backup.exchangeRates) {
        await tx.insert(exchangeRates).values({ userId: ctx.user.id, fromCurrency: rate.fromCurrency, toCurrency: rate.toCurrency, rate: rate.rate.toFixed(8), effectiveOn: rate.effectiveOn, note: rate.note });
      }
      for (const loan of backup.loans) {
        const result = await tx.insert(loans).values({ userId: ctx.user.id, name: loan.name, lender: loan.lender, currency: loan.currency, originalPrincipal: loan.originalPrincipal.toFixed(2), currentPrincipal: loan.currentPrincipal === null ? null : loan.currentPrincipal.toFixed(2), annualInterestRate: loan.annualInterestRate.toFixed(5), monthlyPayment: loan.monthlyPayment.toFixed(2), paymentDay: loan.paymentDay, startDate: loan.startDate, endDate: loan.endDate, amortizationMethod: loan.amortizationMethod, status: loan.status, notes: loan.notes });
        loanIdMap.set(loan.id, Number(result[0].insertId));
      }
      for (const feature of backup.loanFeatures) {
        const loanId = loanIdMap.get(feature.loanId);
        if (loanId) await tx.insert(loanFeatures).values({ loanId, label: feature.label, value: feature.value, sortOrder: feature.sortOrder });
      }
      for (const installment of backup.loanInstallments) {
        const loanId = loanIdMap.get(installment.loanId);
        if (!loanId) continue;
        await tx.insert(loanInstallments).values({ loanId, installmentNumber: installment.installmentNumber, dueDate: installment.dueDate, totalPayment: installment.totalPayment.toFixed(2), principalPayment: installment.principalPayment.toFixed(2), interestPayment: installment.interestPayment.toFixed(2), remainingPrincipal: installment.remainingPrincipal.toFixed(2), isPaid: installment.isPaid, paidOn: installment.paidOn }).onDuplicateKeyUpdate({ set: { dueDate: installment.dueDate, totalPayment: installment.totalPayment.toFixed(2), principalPayment: installment.principalPayment.toFixed(2), interestPayment: installment.interestPayment.toFixed(2), remainingPrincipal: installment.remainingPrincipal.toFixed(2), isPaid: installment.isPaid, paidOn: installment.paidOn } });
      }
      for (const financing of backup.financings) {
        await tx.insert(financings).values({ userId: ctx.user.id, concept: financing.concept, provider: financing.provider, currency: financing.currency, monthlyAmount: financing.monthlyAmount.toFixed(2), totalAmount: financing.totalAmount === null ? null : financing.totalAmount.toFixed(2), paymentDay: financing.paymentDay, startDate: financing.startDate, endDate: financing.endDate, status: financing.status, notes: financing.notes });
      }
      for (const recurring of backup.recurringTransactions) {
        await tx.insert(recurringTransactions).values({ userId: ctx.user.id, categoryId: recurring.categoryId ? categoryIdMap.get(recurring.categoryId) ?? null : null, accountId: recurring.accountId ? accountIdMap.get(recurring.accountId) ?? null : null, name: recurring.name, direction: recurring.direction, kind: recurring.kind, certainty: recurring.direction === "expense" ? "confirmed" : recurring.certainty, currency: recurring.currency, amount: recurring.amount.toFixed(2), dayOfMonth: recurring.dayOfMonth, startDate: recurring.startDate, endDate: recurring.endDate, notes: recurring.notes, isActive: recurring.isActive });
      }
      for (const transaction of backup.transactions) {
        await tx.insert(transactions).values({ userId: ctx.user.id, categoryId: transaction.categoryId ? categoryIdMap.get(transaction.categoryId) ?? null : null, accountId: transaction.accountId ? accountIdMap.get(transaction.accountId) ?? null : null, description: transaction.description, direction: transaction.direction, kind: transaction.kind, certainty: transaction.kind === "possible_income" || transaction.kind === "possible_expense" ? "possible" : transaction.direction === "expense" ? "confirmed" : transaction.certainty, currency: transaction.currency, amount: transaction.amount.toFixed(2), exchangeRateToEur: transaction.currency === "USD" && transaction.exchangeRateToEur ? transaction.exchangeRateToEur.toFixed(8) : null, effectiveDate: transaction.effectiveDate, notes: transaction.notes });
      }
      for (const settlement of backup.monthlyConceptSettlements) {
        const plannedAmount = settlement.plannedAmount ?? settlement.amount;
        const plannedAmountEur = settlement.plannedAmountEur ?? settlement.amountEur;
        await tx.insert(monthlyConceptSettlements).values({ userId: ctx.user.id, month: settlement.month, conceptId: settlement.conceptId, source: settlement.source, description: settlement.description, direction: settlement.direction, certainty: settlement.certainty, currency: settlement.currency, plannedAmount: plannedAmount.toFixed(2), plannedAmountEur: plannedAmountEur === null ? null : plannedAmountEur.toFixed(2), amount: settlement.amount.toFixed(2), amountEur: settlement.amountEur === null ? null : settlement.amountEur.toFixed(2), accountId: settlement.accountId ? accountIdMap.get(settlement.accountId) ?? null : null, status: "settled", settledOn: settlement.settledOn }).onDuplicateKeyUpdate({ set: { source: settlement.source, description: settlement.description, direction: settlement.direction, certainty: settlement.certainty, currency: settlement.currency, plannedAmount: plannedAmount.toFixed(2), plannedAmountEur: plannedAmountEur === null ? null : plannedAmountEur.toFixed(2), amount: settlement.amount.toFixed(2), amountEur: settlement.amountEur === null ? null : settlement.amountEur.toFixed(2), accountId: settlement.accountId ? accountIdMap.get(settlement.accountId) ?? null : null, status: "settled", settledOn: settlement.settledOn } });
      }
      for (const debt of backup.debts) {
        await tx.insert(debts).values({ userId: ctx.user.id, counterparty: debt.counterparty, direction: debt.direction, currency: debt.currency, amount: debt.amount.toFixed(2), originatedOn: debt.originatedOn, dueDate: debt.dueDate, status: debt.status, notes: debt.notes });
      }
      return { success: true, imported: { categories: createdCategories, accounts: createdAccounts, loans: backup.loans.length, financings: backup.financings.length, recurringTransactions: backup.recurringTransactions.length, transactions: backup.transactions.length, settlements: backup.monthlyConceptSettlements.length, debts: backup.debts.length } };
    });
  }),
});

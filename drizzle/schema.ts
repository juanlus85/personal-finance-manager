import {
  boolean,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const currencyValues = ["EUR", "USD"] as const;
export const directionValues = ["income", "expense"] as const;
export const certaintyValues = ["confirmed", "possible"] as const;
export const settlementStatusValues = ["pending", "settled"] as const;

/** Core identity table. Google OpenID Connect `sub` values are stored in `openId`. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 255 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const categories = mysqlTable(
  "categories",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    direction: mysqlEnum("direction", directionValues).notNull(),
    color: varchar("color", { length: 16 }).notNull().default("#4C7A68"),
    icon: varchar("icon", { length: 64 }),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("categories_user_direction_idx").on(table.userId, table.direction),
    uniqueIndex("categories_user_name_direction_unique").on(table.userId, table.name, table.direction),
  ],
);

export const accounts = mysqlTable(
  "accounts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 140 }).notNull(),
    type: mysqlEnum("type", ["bank", "cash", "investment", "wallet", "other"]).notNull().default("bank"),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    institution: varchar("institution", { length: 140 }),
    includeInLiquidity: boolean("includeInLiquidity").notNull().default(true),
    notes: text("notes"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("accounts_user_active_idx").on(table.userId, table.isActive)],
);

export const accountBalanceSnapshots = mysqlTable(
  "accountBalanceSnapshots",
  {
    id: int("id").autoincrement().primaryKey(),
    accountId: int("accountId").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    balance: decimal("balance", { precision: 16, scale: 2 }).notNull(),
    recordedOn: date("recordedOn", { mode: "string" }).notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("account_balances_account_date_idx").on(table.accountId, table.recordedOn),
    uniqueIndex("account_balances_account_day_unique").on(table.accountId, table.recordedOn),
  ],
);

export const exchangeRates = mysqlTable(
  "exchangeRates",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    fromCurrency: mysqlEnum("fromCurrency", currencyValues).notNull(),
    toCurrency: mysqlEnum("toCurrency", currencyValues).notNull().default("EUR"),
    rate: decimal("rate", { precision: 18, scale: 8 }).notNull(),
    effectiveOn: date("effectiveOn", { mode: "string" }).notNull(),
    note: varchar("note", { length: 255 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("exchange_rates_lookup_idx").on(table.userId, table.fromCurrency, table.toCurrency, table.effectiveOn),
  ],
);

export const loans = mysqlTable(
  "loans",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    lender: varchar("lender", { length: 160 }),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    originalPrincipal: decimal("originalPrincipal", { precision: 16, scale: 2 }).notNull(),
    currentPrincipal: decimal("currentPrincipal", { precision: 16, scale: 2 }),
    annualInterestRate: decimal("annualInterestRate", { precision: 8, scale: 5 }).notNull().default("0"),
    monthlyPayment: decimal("monthlyPayment", { precision: 16, scale: 2 }).notNull(),
    paymentDay: int("paymentDay").notNull().default(1),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    amortizationMethod: mysqlEnum("amortizationMethod", ["french", "custom", "manual"]).notNull().default("french"),
    status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("loans_user_status_end_idx").on(table.userId, table.status, table.endDate),
  ],
);

export const loanInstallments = mysqlTable(
  "loanInstallments",
  {
    id: int("id").autoincrement().primaryKey(),
    loanId: int("loanId").notNull().references(() => loans.id, { onDelete: "cascade" }),
    installmentNumber: int("installmentNumber").notNull(),
    dueDate: date("dueDate", { mode: "string" }).notNull(),
    totalPayment: decimal("totalPayment", { precision: 16, scale: 2 }).notNull(),
    principalPayment: decimal("principalPayment", { precision: 16, scale: 2 }).notNull(),
    interestPayment: decimal("interestPayment", { precision: 16, scale: 2 }).notNull(),
    remainingPrincipal: decimal("remainingPrincipal", { precision: 16, scale: 2 }).notNull(),
    isPaid: boolean("isPaid").notNull().default(false),
    paidOn: date("paidOn", { mode: "string" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("loan_installments_loan_number_unique").on(table.loanId, table.installmentNumber),
    index("loan_installments_due_idx").on(table.loanId, table.dueDate),
  ],
);

export const loanFeatures = mysqlTable(
  "loanFeatures",
  {
    id: int("id").autoincrement().primaryKey(),
    loanId: int("loanId").notNull().references(() => loans.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 100 }).notNull(),
    value: varchar("value", { length: 255 }).notNull(),
    sortOrder: int("sortOrder").notNull().default(0),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("loan_features_loan_sort_idx").on(table.loanId, table.sortOrder)],
);

export const financings = mysqlTable(
  "financings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    concept: varchar("concept", { length: 180 }).notNull(),
    provider: varchar("provider", { length: 160 }),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    monthlyAmount: decimal("monthlyAmount", { precision: 16, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 16, scale: 2 }),
    paymentDay: int("paymentDay").notNull().default(1),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }).notNull(),
    status: mysqlEnum("status", ["active", "archived"]).notNull().default("active"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("financings_user_status_end_idx").on(table.userId, table.status, table.endDate),
  ],
);

export const recurringTransactions = mysqlTable(
  "recurringTransactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
    accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
    name: varchar("name", { length: 180 }).notNull(),
    direction: mysqlEnum("direction", directionValues).notNull(),
    kind: mysqlEnum("kind", ["fixed_income", "recurring_bill"]).notNull(),
    certainty: mysqlEnum("certainty", certaintyValues).notNull().default("confirmed"),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    amount: decimal("amount", { precision: 16, scale: 2 }).notNull(),
    dayOfMonth: int("dayOfMonth").notNull().default(1),
    startDate: date("startDate", { mode: "string" }).notNull(),
    endDate: date("endDate", { mode: "string" }),
    notes: text("notes"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("recurring_transactions_user_active_idx").on(table.userId, table.isActive, table.direction),
  ],
);

export const transactions = mysqlTable(
  "transactions",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    categoryId: int("categoryId").references(() => categories.id, { onDelete: "set null" }),
    accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
    description: varchar("description", { length: 220 }).notNull(),
    direction: mysqlEnum("direction", directionValues).notNull(),
    kind: mysqlEnum("kind", ["extra_income", "possible_income", "possible_expense", "extra_bill", "card_expense", "card_forecast", "manual_income", "manual_expense"]).notNull(),
    certainty: mysqlEnum("certainty", certaintyValues).notNull().default("confirmed"),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    amount: decimal("amount", { precision: 16, scale: 2 }).notNull(),
    exchangeRateToEur: decimal("exchangeRateToEur", { precision: 18, scale: 8 }),
    effectiveDate: date("effectiveDate", { mode: "string" }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("transactions_user_date_idx").on(table.userId, table.effectiveDate),
    index("transactions_user_kind_date_idx").on(table.userId, table.kind, table.effectiveDate),
  ],
);

/**
 * Per-month reconciliation records. A source concept remains planned and is
 * regenerated in future months; this table only records whether its instance
 * in a specific month has already been collected or paid.
 */
export const monthlyConceptSettlements = mysqlTable(
  "monthlyConceptSettlements",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    month: varchar("month", { length: 7 }).notNull(),
    conceptId: varchar("conceptId", { length: 96 }).notNull(),
    source: varchar("source", { length: 48 }).notNull(),
    description: varchar("description", { length: 220 }).notNull(),
    direction: mysqlEnum("direction", directionValues).notNull(),
    certainty: mysqlEnum("certainty", certaintyValues).notNull().default("confirmed"),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    plannedAmount: decimal("plannedAmount", { precision: 16, scale: 2 }),
    plannedAmountEur: decimal("plannedAmountEur", { precision: 16, scale: 2 }),
    amount: decimal("amount", { precision: 16, scale: 2 }).notNull(),
    amountEur: decimal("amountEur", { precision: 16, scale: 2 }),
    accountId: int("accountId").references(() => accounts.id, { onDelete: "set null" }),
    status: mysqlEnum("status", settlementStatusValues).notNull().default("pending"),
    settledOn: date("settledOn", { mode: "string" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("monthly_settlement_user_month_concept_unique").on(table.userId, table.month, table.conceptId),
    index("monthly_settlement_user_month_status_idx").on(table.userId, table.month, table.status),
    index("monthly_settlement_account_date_idx").on(table.accountId, table.settledOn),
  ],
);

export const debts = mysqlTable(
  "debts",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    counterparty: varchar("counterparty", { length: 160 }).notNull(),
    direction: mysqlEnum("direction", ["in_favor", "against"]).notNull(),
    currency: mysqlEnum("currency", currencyValues).notNull().default("EUR"),
    amount: decimal("amount", { precision: 16, scale: 2 }).notNull(),
    originatedOn: date("originatedOn", { mode: "string" }).notNull(),
    dueDate: date("dueDate", { mode: "string" }),
    status: mysqlEnum("status", ["open", "settled", "cancelled"]).notNull().default("open"),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("debts_user_status_direction_idx").on(table.userId, table.status, table.direction)],
);

export const appSettings = mysqlTable(
  "appSettings",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
    baseCurrency: mysqlEnum("baseCurrency", currencyValues).notNull().default("EUR"),
    timezone: varchar("timezone", { length: 64 }).notNull().default("Europe/Madrid"),
    dashboardPreferences: json("dashboardPreferences"),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Loan = typeof loans.$inferSelect;
export type LoanInstallment = typeof loanInstallments.$inferSelect;
export type Financing = typeof financings.$inferSelect;
export type RecurringTransaction = typeof recurringTransactions.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type MonthlyConceptSettlement = typeof monthlyConceptSettlements.$inferSelect;
export type Debt = typeof debts.$inferSelect;

import { describe, expect, it } from "vitest";
import {
  calculateMonthlyBalances,
  calculateMonthlySettlement,
  generateFrenchAmortizationSchedule,
  isActiveDuringMonth,
  monthBounds,
} from "./calculations";

describe("financial calculations", () => {
  it("includes an obligation in its final month and excludes it afterwards", () => {
    expect(isActiveDuringMonth("2025-01-01", "2026-09-01", "2026-09")).toBe(true);
    expect(isActiveDuringMonth("2025-01-01", "2026-09-01", "2026-10")).toBe(false);
  });

  it("calculates month boundaries including leap years", () => {
    expect(monthBounds("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  it("creates a French amortization schedule ending at zero principal", () => {
    const schedule = generateFrenchAmortizationSchedule({
      principal: 1000,
      annualInterestRate: 12,
      monthlyPayment: 90,
      startDate: "2026-01-01",
      endDate: "2027-12-31",
      paymentDay: 5,
    });

    expect(schedule[0]).toMatchObject({
      installmentNumber: 1,
      dueDate: "2026-01-05",
      interestPayment: 10,
    });
    expect(schedule.at(-1)?.remainingPrincipal).toBe(0);
  });

  it("keeps possible income out of the confirmed balance", () => {
    expect(
      calculateMonthlyBalances([
        { direction: "income", certainty: "confirmed", amountEur: 1000 },
        { direction: "income", certainty: "possible", amountEur: 200 },
        { direction: "expense", certainty: "confirmed", amountEur: 650 },
        { direction: "income", certainty: "confirmed", amountEur: null },
      ]),
    ).toEqual({
      confirmedIncome: 1000,
      possibleIncome: 200,
      expenses: 650,
      confirmedBalance: 350,
      balanceWithPossibleIncome: 550,
      linesWithoutConversion: 1,
    });
  });

  it("separates settled cash movements from next actions without carrying them to a new month", () => {
    const currentMonth = calculateMonthlySettlement([
      { direction: "income", certainty: "confirmed", amountEur: 2000, settlementStatus: "settled" },
      { direction: "expense", certainty: "confirmed", amountEur: 650, settlementStatus: "pending" },
      { direction: "income", certainty: "possible", amountEur: 300, settlementStatus: "pending" },
      { direction: "expense", certainty: "confirmed", amountEur: 50, settlementStatus: "settled" },
    ]);

    expect(currentMonth).toMatchObject({
      settledIncome: 2000,
      settledExpenses: 50,
      settledNet: 1950,
      pendingConfirmedIncome: 0,
      pendingPossibleIncome: 300,
      pendingExpenses: 650,
      pendingConcepts: 2,
      settledConcepts: 2,
    });

    const followingMonth = calculateMonthlySettlement([
      { direction: "income", certainty: "confirmed", amountEur: 2000, settlementStatus: "pending" },
      { direction: "expense", certainty: "confirmed", amountEur: 650, settlementStatus: "pending" },
    ]);
    expect(followingMonth).toMatchObject({ settledConcepts: 0, pendingConcepts: 2, pendingConfirmedIncome: 2000, pendingExpenses: 650 });
  });
});

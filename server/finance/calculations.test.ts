import { describe, expect, it } from "vitest";
import {
  calculateMonthlyBalances,
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
});

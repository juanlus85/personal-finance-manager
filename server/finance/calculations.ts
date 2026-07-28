export type Currency = "EUR" | "USD";
export type BalanceCertainty = "confirmed" | "possible";

export type AmortizationInput = {
  principal: number;
  annualInterestRate: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string;
  paymentDay: number;
};

export type GeneratedInstallment = {
  installmentNumber: number;
  dueDate: string;
  totalPayment: number;
  principalPayment: number;
  interestPayment: number;
  remainingPrincipal: number;
};

export type BalanceLine = {
  direction: "income" | "expense";
  certainty: BalanceCertainty;
  amountEur: number | null;
};

export type MonthlyBalanceSummary = {
  confirmedIncome: number;
  possibleIncome: number;
  expenses: number;
  confirmedBalance: number;
  balanceWithPossibleIncome: number;
  linesWithoutConversion: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function monthBounds(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Month must follow the YYYY-MM format.");
  }

  const [year, monthNumber] = month.split("-").map(Number);
  const endDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(endDay).padStart(2, "0")}`,
  };
}

export function isActiveDuringMonth(
  startDate: string,
  endDate: string | null | undefined,
  month: string,
) {
  const { start, end } = monthBounds(month);
  return startDate <= end && (!endDate || endDate >= start);
}

export function addMonths(isoDate: string, months: number, paymentDay: number) {
  if (!ISO_DATE.test(isoDate)) {
    throw new Error("Date must follow the YYYY-MM-DD format.");
  }

  const [year, month] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const day = Math.min(Math.max(paymentDay, 1), lastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function countPaymentMonths(startDate: string, endDate: string) {
  const [startYear, startMonth] = startDate.split("-").map(Number);
  const [endYear, endMonth] = endDate.split("-").map(Number);
  return Math.max(0, (endYear - startYear) * 12 + endMonth - startMonth + 1);
}

export function generateFrenchAmortizationSchedule(input: AmortizationInput): GeneratedInstallment[] {
  const principal = roundMoney(input.principal);
  const monthlyPayment = roundMoney(input.monthlyPayment);
  const monthlyRate = input.annualInterestRate / 100 / 12;
  const installments: GeneratedInstallment[] = [];
  const paymentCount = countPaymentMonths(input.startDate, input.endDate);

  if (principal <= 0 || monthlyPayment <= 0 || paymentCount <= 0) {
    return installments;
  }

  let remainingPrincipal = principal;

  for (let index = 0; index < paymentCount && remainingPrincipal > 0; index += 1) {
    const interestPayment = roundMoney(remainingPrincipal * monthlyRate);
    const regularPrincipalPayment = roundMoney(monthlyPayment - interestPayment);
    const principalPayment = Math.min(remainingPrincipal, Math.max(0, regularPrincipalPayment));
    const totalPayment = roundMoney(principalPayment + interestPayment);
    remainingPrincipal = roundMoney(Math.max(0, remainingPrincipal - principalPayment));

    installments.push({
      installmentNumber: index + 1,
      dueDate: addMonths(input.startDate, index, input.paymentDay),
      totalPayment,
      principalPayment,
      interestPayment,
      remainingPrincipal,
    });
  }

  return installments;
}

export function calculateMonthlyBalances(lines: BalanceLine[]): MonthlyBalanceSummary {
  let confirmedIncome = 0;
  let possibleIncome = 0;
  let expenses = 0;
  let linesWithoutConversion = 0;

  for (const line of lines) {
    if (line.amountEur === null) {
      linesWithoutConversion += 1;
      continue;
    }

    if (line.direction === "expense") {
      expenses += line.amountEur;
      continue;
    }

    if (line.certainty === "possible") {
      possibleIncome += line.amountEur;
    } else {
      confirmedIncome += line.amountEur;
    }
  }

  const confirmedBalance = roundMoney(confirmedIncome - expenses);
  return {
    confirmedIncome: roundMoney(confirmedIncome),
    possibleIncome: roundMoney(possibleIncome),
    expenses: roundMoney(expenses),
    confirmedBalance,
    balanceWithPossibleIncome: roundMoney(confirmedBalance + possibleIncome),
    linesWithoutConversion,
  };
}

export function convertToEur(
  amount: number,
  currency: Currency,
  exchangeRateToEur?: number | null,
) {
  if (currency === "EUR") return roundMoney(amount);
  if (!exchangeRateToEur || exchangeRateToEur <= 0) return null;
  return roundMoney(amount * exchangeRateToEur);
}

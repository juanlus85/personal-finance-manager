import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatMoney, nextMonth, previousMonth, readableMonth } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight, CircleAlert, Landmark, Plus, Sparkles, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

type Line = {
  id: string;
  source: string;
  description: string;
  direction: "income" | "expense";
  certainty: "confirmed" | "possible";
  amount: number;
  currency: "EUR" | "USD";
  amountEur: number | null;
  category: string;
};

function LineGroup({ title, subtitle, lines, tone }: { title: string; subtitle: string; lines: Line[]; tone: "income" | "expense" | "possible" }) {
  const colors = {
    income: "bg-[#EAF4EC] text-[#276548]",
    expense: "bg-[#FFF1E8] text-[#A85831]",
    possible: "bg-[#EAF0FA] text-[#536B97]",
  }[tone];
  const total = lines.reduce((sum, line) => sum + Number(line.amountEur ?? 0), 0);

  return (
    <Card className="card-elevated overflow-hidden">
      <CardHeader className="p-5 sm:p-6 pb-3 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-display text-xl">{title}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${colors}`}>
          {tone === "expense" ? <ArrowDownRight className="h-5 w-5" /> : tone === "possible" ? <Sparkles className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="px-5 sm:px-6 pb-4"><p className="font-mono-finance text-xl">{formatMoney(total)}</p></div>
        {lines.length ? (
          <div className="border-t border-border divide-y divide-border">
            {lines.map(line => (
              <div key={line.id} className="px-5 sm:px-6 py-3 flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{line.description}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {line.category} · {line.source === "loan" ? "Préstamo" : line.source === "financing" ? "Financiación" : line.source === "recurring" ? "Habitual" : line.source === "card_forecast" ? "Previsión de tarjeta" : "Puntual"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-finance text-sm">{formatMoney(line.amountEur)}</p>
                  {line.currency !== "EUR" ? <p className="text-[10px] text-muted-foreground mt-0.5">{formatMoney(line.amount, line.currency)}</p> : null}
                </div>
              </div>
            ))}
          </div>
        ) : <div className="px-6 py-8 text-center text-sm text-muted-foreground">No hay partidas para este bloque.</div>}
      </CardContent>
    </Card>
  );
}

function MonthlyContent() {
  const [month, setMonth] = useState(currentMonth);
  const [, setLocation] = useLocation();
  const query = trpc.finance.monthlySummary.useQuery({ month });
  const summary = query.data;
  const confirmedIncome = useMemo(() => (summary?.lines ?? []).filter(line => line.direction === "income" && line.certainty === "confirmed"), [summary?.lines]);
  const possibleIncome = useMemo(() => (summary?.lines ?? []).filter(line => line.direction === "income" && line.certainty === "possible"), [summary?.lines]);
  const confirmedExpenses = useMemo(() => (summary?.lines ?? []).filter(line => line.direction === "expense" && line.certainty === "confirmed"), [summary?.lines]);
  const possibleExpenses = useMemo(() => (summary?.lines ?? []).filter(line => line.direction === "expense" && line.certainty === "possible"), [summary?.lines]);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Balance mensual</Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">Resumen de {readableMonth(month).toLowerCase()}</h1>
          <p className="text-muted-foreground mt-2 leading-6 max-w-2xl">Un desglose claro de lo confirmado y de los ingresos o gastos todavía posibles.</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 card-elevated">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(previousMonth(month))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[138px] text-center text-sm font-medium capitalize">{readableMonth(month)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(nextMonth(month))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          <Button className="rounded-xl" onClick={() => setLocation("/movimientos")}><Plus className="h-4 w-4 mr-2" />Movimiento</Button>
        </div>
      </section>

      {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div> : null}
      {query.isError ? <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-6 flex gap-3"><CircleAlert className="h-5 w-5 text-destructive" /><div><p className="font-medium">No se pudo cargar el resumen mensual</p><p className="text-sm text-muted-foreground mt-1">{query.error.message}</p></div></CardContent></Card> : null}
      {summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-[#CDE4D4] bg-[#EEF7F0] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#4D7659]">Ingresos confirmados</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(summary.balances.confirmedIncome)}</p><p className="text-xs text-[#4D7659] mt-2">Fijos y extraordinarios seguros</p></CardContent></Card>
            <Card className="border-[#F0DFBC] bg-[#FFF8E8] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#7E641A]">Gastos previstos</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(summary.balances.expenses)}</p><p className="text-xs text-[#7E641A] mt-2">Incluye cuotas vigentes y tarjetas previstas</p></CardContent></Card>
            <Card className="card-elevated"><CardContent className="p-5"><div className="flex justify-between"><div><p className="text-xs uppercase tracking-[0.13em] text-muted-foreground">Balance confirmado</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(summary.balances.confirmedBalance)}</p><p className="text-xs text-muted-foreground mt-2">Resultado del mes</p></div><Wallet className="h-5 w-5 text-primary" /></div></CardContent></Card>
            <Card className="border-[#D9E1F1] bg-[#F1F4FC] card-elevated"><CardContent className="p-5"><div className="flex justify-between"><div><p className="text-xs uppercase tracking-[0.13em] text-[#536B97]">Con posibles</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(summary.balances.balanceWithPossibleIncome)}</p><p className="text-xs text-[#536B97] mt-2">+ {formatMoney(summary.balances.possibleIncome)} ingresos · − {formatMoney(summary.balances.possibleExpenses)} gastos</p></div><Sparkles className="h-5 w-5 text-[#536B97]" /></div></CardContent></Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card className="border-[#CDE4D4] bg-[#F6FBF7] card-elevated"><CardContent className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.13em] text-[#4D7659]">Saldo final confirmado</p><p className="font-mono-finance text-3xl mt-2">{formatMoney(summary.finalProjection.confirmedFinal)}</p><p className="text-xs text-[#4D7659] mt-2">Disponible actual {formatMoney(summary.finalProjection.currentLiquidity)} + {formatMoney(summary.finalProjection.pendingConfirmedIncome)} por cobrar − {formatMoney(summary.finalProjection.pendingConfirmedExpenses)} por pagar</p></div><Wallet className="h-5 w-5 text-primary shrink-0" /></div></CardContent></Card>
            <Card className="border-[#D9E1F1] bg-[#F1F4FC] card-elevated"><CardContent className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.13em] text-[#536B97]">Saldo final con posibles</p><p className="font-mono-finance text-3xl mt-2">{formatMoney(summary.finalProjection.finalWithPossible)}</p><p className="text-xs text-[#536B97] mt-2">Confirmado + {formatMoney(summary.finalProjection.pendingPossibleIncome)} posible por cobrar − {formatMoney(summary.finalProjection.pendingPossibleExpenses)} posible por pagar</p></div><Sparkles className="h-5 w-5 text-[#536B97] shrink-0" /></div></CardContent></Card>
          </section>

          {summary.balances.linesWithoutConversion ? <Card className="border-[#E9DAB6] bg-[#FFF9E9]"><CardContent className="py-3 px-4 flex gap-2 items-center"><CircleAlert className="h-4 w-4 text-[#916D19]" /><p className="text-sm text-[#62480D]">Hay {summary.balances.linesWithoutConversion} partidas sin conversión USD → EUR, por lo que no entran todavía en el total consolidado.</p></CardContent></Card> : null}

          <section className="grid gap-5 xl:grid-cols-4">
            <LineGroup title="Ingresos confirmados" subtitle="Cobros que forman parte del balance confirmado." lines={confirmedIncome} tone="income" />
            <LineGroup title="Gastos del mes" subtitle="Recibos, tarjetas, préstamos y financiaciones vigentes." lines={confirmedExpenses} tone="expense" />
            <LineGroup title="Ingresos posibles" subtitle="Se presentan por separado hasta que se confirmen." lines={possibleIncome} tone="possible" />
            <LineGroup title="Gastos posibles" subtitle="Solo afectan al escenario ampliado hasta confirmarlos." lines={possibleExpenses} tone="possible" />
          </section>

          <Card className="card-elevated">
            <CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Reglas aplicadas en este resumen</CardTitle></CardHeader>
            <CardContent className="p-5 sm:p-6 pt-0 grid gap-4 md:grid-cols-3">
              <div className="flex gap-3"><Landmark className="h-5 w-5 text-primary shrink-0" /><p className="text-sm text-muted-foreground">Préstamos activos: <strong className="text-foreground">{summary.activeLoans}</strong>. Los vencidos se excluyen automáticamente.</p></div>
              <div className="flex gap-3"><Landmark className="h-5 w-5 text-primary shrink-0" /><p className="text-sm text-muted-foreground">Financiaciones activas: <strong className="text-foreground">{summary.activeFinancings}</strong>. Se detienen tras su fecha final.</p></div>
              <div className="flex gap-3"><Wallet className="h-5 w-5 text-primary shrink-0" /><p className="text-sm text-muted-foreground">Las deudas a favor y en contra quedan fuera de este balance mensual.</p></div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function MonthlyPage() {
  return <DashboardLayout><MonthlyContent /></DashboardLayout>;
}

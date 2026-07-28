import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatMoney, nextMonth, previousMonth, readableMonth } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CreditCard,
  Landmark,
  LineChart,
  Plus,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { useLocation } from "wouter";

const CATEGORY_COLORS = ["#2D6A5E", "#D5A942", "#B76A4A", "#6478A0", "#7B9A72", "#917154"];

function MonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 card-elevated">
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onChange(previousMonth(month))} aria-label="Mes anterior">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="min-w-[138px] text-center text-sm font-medium capitalize">{readableMonth(month)}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => onChange(nextMonth(month))} aria-label="Mes siguiente">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  note,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  note: string;
  tone?: "neutral" | "positive" | "warm" | "possible";
  icon: typeof Wallet;
}) {
  const styles = {
    neutral: "bg-card border-border",
    positive: "bg-[#E8F3EA] border-[#CAE4D0]",
    warm: "bg-[#FFF4DD] border-[#F0DFC0]",
    possible: "bg-[#EDF1FA] border-[#D8E0F1]",
  }[tone];
  const iconStyles = {
    neutral: "bg-secondary text-foreground",
    positive: "bg-primary text-primary-foreground",
    warm: "bg-[#F8DF9C] text-[#714E0B]",
    possible: "bg-[#D9E2F5] text-[#465D8A]",
  }[tone];

  return (
    <Card className={`border ${styles} card-elevated overflow-hidden`}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-medium">{label}</p>
            <p className="font-mono-finance text-2xl sm:text-[1.75rem] tracking-[-0.06em] font-medium mt-2">{value}</p>
            <p className="text-xs text-muted-foreground mt-2 leading-5">{note}</p>
          </div>
          <span className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${iconStyles}`}>
            <Icon className="h-5 w-5" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DonutChart({ data, emptyLabel }: { data: Array<{ label: string; amount: number }>; emptyLabel: string }) {
  if (data.length === 0) {
    return <div className="h-[220px] flex items-center justify-center text-center text-sm text-muted-foreground px-8">{emptyLabel}</div>;
  }

  return (
    <div className="h-[220px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="amount" nameKey="label" innerRadius={58} outerRadius={83} paddingAngle={3} stroke="none">
            {data.map((entry, index) => <Cell key={entry.label} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />)}
          </Pie>
          <Tooltip formatter={(value: number) => formatMoney(value)} contentStyle={{ borderRadius: 12, border: "1px solid #E7E0D0", boxShadow: "0 8px 22px rgba(52,40,22,.08)" }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
        <span className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Total</span>
        <span className="font-mono-finance text-sm">{formatMoney(data.reduce((total, item) => total + item.amount, 0))}</span>
      </div>
    </div>
  );
}

function DashboardContent() {
  const [month, setMonth] = useState(currentMonth);
  const [, setLocation] = useLocation();
  const summaryQuery = trpc.finance.monthlySummary.useQuery({ month });
  const summary = summaryQuery.data;

  const confirmedLines = useMemo(
    () => (summary?.lines ?? []).filter(line => line.certainty === "confirmed"),
    [summary?.lines],
  );

  const liquidity = useMemo(
    () => (summary?.accountLiquidity ?? []).filter(account => account.included && account.balanceEur !== null)
      .reduce((total, account) => total + Number(account.balanceEur), 0),
    [summary?.accountLiquidity],
  );

  const totalDebtsInFavor = useMemo(
    () => (summary?.debts ?? []).filter(debt => debt.direction === "in_favor").reduce((total, debt) => total + Number(debt.amountEur ?? 0), 0),
    [summary?.debts],
  );
  const totalDebtsAgainst = useMemo(
    () => (summary?.debts ?? []).filter(debt => debt.direction === "against").reduce((total, debt) => total + Number(debt.amountEur ?? 0), 0),
    [summary?.debts],
  );

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Espacio privado</Badge>
            <span className="text-xs text-muted-foreground">EUR · USD</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em]">Tu panorama financiero</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl leading-6">Controla el mes con claridad: flujo confirmado, escenario posible y posición de liquidez en un único lugar.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <MonthSelector month={month} onChange={setMonth} />
          <Button className="rounded-xl shadow-lg shadow-primary/15" onClick={() => setLocation("/movimientos")}> <Plus className="h-4 w-4 mr-2" /> Registrar movimiento </Button>
        </div>
      </section>

      {summaryQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40 rounded-2xl" />)}</div>
      ) : summaryQuery.isError ? (
        <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-6 flex gap-3 items-start"><CircleAlert className="h-5 w-5 text-destructive mt-0.5" /><div><p className="font-medium">No se pudo cargar el resumen</p><p className="text-sm text-muted-foreground mt-1">{summaryQuery.error.message}</p></div></CardContent></Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Ingresos confirmados" value={formatMoney(summary?.balances.confirmedIncome)} note="Fijos y extraordinarios ya confirmados" tone="positive" icon={ArrowUpRight} />
            <MetricCard label="Gastos del mes" value={formatMoney(summary?.balances.expenses)} note="Recibos, tarjetas, préstamos y financiaciones" tone="warm" icon={ArrowDownRight} />
            <MetricCard label="Balance confirmado" value={formatMoney(summary?.balances.confirmedBalance)} note="Sin considerar cobros inciertos" tone="neutral" icon={Wallet} />
            <MetricCard label="Balance con posibles" value={formatMoney(summary?.balances.balanceWithPossibleIncome)} note={`Incluye ${formatMoney(summary?.balances.possibleIncome)} de ingresos posibles`} tone="possible" icon={Sparkles} />
          </section>

          {summary?.balances.linesWithoutConversion ? (
            <Card className="border-[#E9DAB6] bg-[#FFF9E9]"><CardContent className="py-3 px-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-2 items-center"><CircleAlert className="h-4 w-4 text-[#916D19]" /><p className="text-sm text-[#62480D]"><strong>{summary.balances.linesWithoutConversion}</strong> movimiento(s) no se incluyen en el total porque falta un tipo de cambio USD → EUR.</p></div><Button variant="outline" size="sm" className="border-[#DDBF75] bg-transparent" onClick={() => setLocation("/configuracion")}>Añadir tipo de cambio</Button></CardContent></Card>
          ) : null}

          <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
            <Card className="card-elevated border-border overflow-hidden">
              <CardHeader className="p-5 sm:p-6 pb-2 flex-row items-start justify-between space-y-0">
                <div><CardTitle className="font-display text-xl">Pulso mensual</CardTitle><p className="text-sm text-muted-foreground mt-1">La composición del flujo confirmado de {readableMonth(month).toLowerCase()}.</p></div>
                <Badge variant="secondary" className="rounded-full font-mono-finance text-[11px]">{confirmedLines.length} líneas</Badge>
              </CardHeader>
              <CardContent className="p-5 sm:p-6 pt-4">
                {confirmedLines.length === 0 ? (
                  <div className="h-[245px] rounded-2xl soft-grid border border-dashed border-border flex flex-col items-center justify-center text-center p-6"><LineChart className="h-8 w-8 text-primary mb-3" /><p className="font-medium">Aún no hay movimientos para este mes</p><p className="text-sm text-muted-foreground mt-1 max-w-sm">Añade ingresos, recibos o gastos de tarjeta y el resumen se actualizará automáticamente.</p><Button size="sm" variant="outline" className="mt-4 rounded-lg" onClick={() => setLocation("/movimientos")}>Gestionar movimientos</Button></div>
                ) : (
                  <div className="space-y-3">
                    {(summary?.lines ?? []).slice(0, 7).map(line => <div key={line.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-secondary/55 transition-colors"><span className={`h-9 w-9 rounded-xl flex items-center justify-center ${line.direction === "income" ? "bg-[#E5F3EA] text-[#276548]" : "bg-[#FFF1E8] text-[#A85831]"}`}>{line.direction === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{line.description}</p><p className="text-xs text-muted-foreground mt-0.5">{line.category}{line.certainty === "possible" ? " · posible" : ""}</p></div><p className={`font-mono-finance text-sm ${line.direction === "income" ? "text-[#276548]" : "text-foreground"}`}>{line.direction === "income" ? "+" : "−"}{formatMoney(line.amountEur)}</p></div>)}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="card-elevated border-border">
              <CardHeader className="p-5 sm:p-6 pb-0"><CardTitle className="font-display text-xl">Gastos por categoría</CardTitle><p className="text-sm text-muted-foreground mt-1">Distribución de los gastos previstos y registrados.</p></CardHeader>
              <CardContent className="p-4 sm:p-5"><DonutChart data={summary?.expenseBreakdown ?? []} emptyLabel="Cuando registres gastos, verás aquí su distribución por categoría." /><div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-2">{(summary?.expenseBreakdown ?? []).slice(0, 4).map((item, index) => <div key={item.label} className="flex items-center gap-2 min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }} /><span className="text-xs truncate text-muted-foreground">{item.label}</span></div>)}</div></CardContent>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-2">
            <Card className="card-elevated border-border"><CardHeader className="p-5 sm:p-6 pb-2 flex-row items-start justify-between space-y-0"><div><CardTitle className="font-display text-xl">Dinero disponible</CardTitle><p className="text-sm text-muted-foreground mt-1">Saldos más recientes de tus cuentas y efectivo.</p></div><div className="text-right"><p className="font-mono-finance text-lg">{formatMoney(liquidity)}</p><p className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1">Liquidez incluida</p></div></CardHeader><CardContent className="p-5 sm:p-6 pt-3 space-y-2">{(summary?.accountLiquidity ?? []).length ? (summary?.accountLiquidity ?? []).slice(0, 5).map(account => <div key={account.id} className="flex items-center gap-3 py-2.5 border-b border-border/70 last:border-0"><span className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center"><Landmark className="h-4 w-4 text-primary" /></span><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{account.name}</p><p className="text-xs text-muted-foreground mt-0.5">{account.currency} · {account.recordedOn ?? "Sin saldo registrado"}</p></div><p className="font-mono-finance text-sm">{formatMoney(account.balance, account.currency)}</p></div>) : <p className="text-sm text-muted-foreground py-6 text-center">Todavía no has añadido cuentas ni saldos.</p>}<Button variant="outline" size="sm" className="mt-2 rounded-lg" onClick={() => setLocation("/cuentas")}>Gestionar cuentas</Button></CardContent></Card>
            <Card className="card-elevated border-border"><CardHeader className="p-5 sm:p-6 pb-2"><CardTitle className="font-display text-xl">Deudas informativas</CardTitle><p className="text-sm text-muted-foreground mt-1">Estas cantidades no afectan al balance mensual.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-3"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#EAF4EC] p-4"><p className="text-[11px] uppercase tracking-[0.12em] text-[#4B7459]">A tu favor</p><p className="font-mono-finance text-lg mt-2">{formatMoney(totalDebtsInFavor)}</p></div><div className="rounded-xl bg-[#FFF0E8] p-4"><p className="text-[11px] uppercase tracking-[0.12em] text-[#9A5A38]">En contra</p><p className="font-mono-finance text-lg mt-2">{formatMoney(totalDebtsAgainst)}</p></div></div><Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={() => setLocation("/cuentas")}>Ver deudas</Button></CardContent></Card>
          </section>
        </>
      )}
    </div>
  );
}

export default function Home() {
  return <DashboardLayout><DashboardContent /></DashboardLayout>;
}

import DashboardLayout from "@/components/DashboardLayout";
import { SettlementDialog, type SettlementLine } from "@/components/finance/SettlementDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatMoney, nextMonth, previousMonth, readableMonth } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheckBig,
  Landmark,
  RotateCcw,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type ReconciledLine = SettlementLine & {
  category: string;
  settlementStatus: "pending" | "settled";
  settlementAccountId: number | null;
  settledOn: string | null;
  plannedAmount: number;
  plannedAmountEur: number | null;
  settledAmount: number | null;
  settledAmountEur: number | null;
};

type FinalProjection = {
  currentLiquidity: number;
  pendingConfirmedIncome: number;
  pendingConfirmedExpenses: number;
  pendingPossibleIncome: number;
  pendingPossibleExpenses: number;
  confirmedFinal: number;
  finalWithPossible: number;
};

function ConceptRow({
  line,
  onSettle,
  onUndo,
}: {
  line: ReconciledLine;
  onSettle: (line: SettlementLine) => void;
  onUndo: (line: ReconciledLine) => void;
}) {
  const settled = line.settlementStatus === "settled";
  const action = line.direction === "income" ? (line.certainty === "possible" ? "Confirmar y cobrar" : "Cobrar") : "Pagar";
  const actualAmount = settled ? line.settledAmount ?? line.amount : line.amount;
  const actualAmountEur = settled ? line.settledAmountEur ?? line.amountEur : line.amountEur;
  const variance = settled && line.settledAmount !== null ? line.settledAmount - line.plannedAmount : 0;

  return (
    <div className="flex flex-col gap-3 px-4 py-4 border-b border-border last:border-b-0 sm:flex-row sm:items-center sm:px-5">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${settled ? "bg-[#EAF4EC] text-[#276548]" : line.direction === "income" ? "bg-[#EEF7F0] text-[#386C49]" : "bg-[#FFF1E8] text-[#A85831]"}`}>
        {settled ? <Check className="h-4 w-4" /> : line.direction === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium truncate">{line.description}</p>
          {settled ? <Badge variant="outline" className="border-[#B9D9C0] bg-[#EFF8F0] text-[#28643D]">{line.direction === "income" ? "Cobrado" : "Pagado"}</Badge> : line.certainty === "possible" ? <Badge variant="outline" className="border-[#D8E0F1] bg-[#F1F4FC] text-[#536B97]">Posible</Badge> : <Badge variant="outline" className="text-muted-foreground">Pendiente</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{line.category}{settled && line.settledOn ? ` · Liquidado el ${new Date(`${line.settledOn}T12:00:00`).toLocaleDateString("es-ES")}` : " · Pendiente este mes"}</p>
      </div>
      <div className="flex items-center justify-between sm:justify-end gap-3">
        <div className="text-right">
          <p className="font-mono-finance text-sm">{actualAmountEur === null ? "Sin cambio EUR" : formatMoney(actualAmountEur)}</p>
          {line.currency !== "EUR" ? <p className="text-[10px] text-muted-foreground">{formatMoney(actualAmount, line.currency)}</p> : null}
          {settled && variance !== 0 ? <p className={`text-[10px] mt-1 ${variance > 0 ? "text-[#276548]" : "text-[#A85831]"}`}>Ajuste: {variance > 0 ? "+" : ""}{formatMoney(variance, line.currency)}</p> : null}
        </div>
        {settled ? <Button variant="outline" size="sm" className="rounded-lg" onClick={() => onUndo(line)}><RotateCcw className="h-3.5 w-3.5 mr-1.5" />Deshacer</Button> : <Button size="sm" className="rounded-lg" onClick={() => onSettle(line)}>{action}</Button>}
      </div>
    </div>
  );
}

function ProjectionCards({ projection }: { projection: FinalProjection }) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card className="border-[#CDE4D4] bg-[#F6FBF7] card-elevated">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-[#4D7659]">Saldo final confirmado</p>
              <p className="font-mono-finance text-3xl mt-2">{formatMoney(projection.confirmedFinal)}</p>
              <p className="text-xs text-[#4D7659] mt-2">Disponible {formatMoney(projection.currentLiquidity)} + {formatMoney(projection.pendingConfirmedIncome)} por cobrar − {formatMoney(projection.pendingConfirmedExpenses)} por pagar</p>
            </div>
            <Wallet className="h-5 w-5 text-primary shrink-0" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-[#D9E1F1] bg-[#F1F4FC] card-elevated">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.13em] text-[#536B97]">Saldo final con posibles</p>
              <p className="font-mono-finance text-3xl mt-2">{formatMoney(projection.finalWithPossible)}</p>
              <p className="text-xs text-[#536B97] mt-2">Confirmado + {formatMoney(projection.pendingPossibleIncome)} posible por cobrar − {formatMoney(projection.pendingPossibleExpenses)} posible por pagar</p>
            </div>
            <Sparkles className="h-5 w-5 text-[#536B97] shrink-0" />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function SettlementContent() {
  const [month, setMonth] = useState(currentMonth);
  const [selectedLine, setSelectedLine] = useState<SettlementLine | null>(null);
  const query = trpc.finance.monthlySummary.useQuery({ month });
  const utils = trpc.useUtils();
  const undoMutation = trpc.finance.settlements.undo.useMutation({
    onSuccess: async () => {
      await utils.finance.monthlySummary.invalidate();
      toast.success("El concepto vuelve a estar pendiente.");
    },
    onError: error => toast.error(error.message),
  });
  const summary = query.data;
  const lines = (summary?.lines ?? []) as ReconciledLine[];
  const pendingIncome = useMemo(() => lines.filter(line => line.settlementStatus === "pending" && line.direction === "income"), [lines]);
  const pendingExpenses = useMemo(() => lines.filter(line => line.settlementStatus === "pending" && line.direction === "expense"), [lines]);
  const settled = useMemo(() => lines.filter(line => line.settlementStatus === "settled"), [lines]);
  const settlement = summary?.settlement;

  const undo = (line: ReconciledLine) => {
    const label = line.direction === "income" ? "cobro" : "pago";
    if (!window.confirm(`¿Deshacer el ${label} de “${line.description}”? El concepto volverá a quedar pendiente y se revertirá su efecto disponible.`)) return;
    undoMutation.mutate({ month, conceptId: line.id });
  };

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Operativa del mes</Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">Liquidar {readableMonth(month).toLowerCase()}</h1>
          <p className="text-muted-foreground mt-2 leading-6 max-w-2xl">Cuando cobras o pagas, marca el concepto, elige dónde se mueve el dinero y consulta lo que queda disponible.</p>
        </div>
        <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 card-elevated">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(previousMonth(month))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-[138px] text-center text-sm font-medium capitalize">{readableMonth(month)}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(nextMonth(month))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </section>

      {query.isLoading ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)}</div> : null}
      {query.isError ? <Card className="border-destructive/30 bg-destructive/5"><CardContent className="p-6 flex gap-3"><CircleAlert className="h-5 w-5 text-destructive" /><div><p className="font-medium">No se pudo cargar la liquidación mensual</p><p className="text-sm text-muted-foreground mt-1">{query.error.message}</p></div></CardContent></Card> : null}

      {summary ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="border-[#CDE4D4] bg-[#EEF7F0] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#4D7659]">Disponible en cuentas</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(summary.availableLiquidity)}</p><p className="text-xs text-[#4D7659] mt-2">Saldo registrado + movimientos liquidados</p></CardContent></Card>
            <Card className="border-[#D9E1F1] bg-[#F1F4FC] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#536B97]">Pendiente de cobrar</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(settlement?.pendingConfirmedIncome)}</p><p className="text-xs text-[#536B97] mt-2">+ {formatMoney(settlement?.pendingPossibleIncome)} posible</p></CardContent></Card>
            <Card className="border-[#F0DFBC] bg-[#FFF8E8] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#7E641A]">Pendiente de pagar</p><p className="font-mono-finance text-2xl mt-2">{formatMoney(settlement?.pendingExpenses)}</p><p className="text-xs text-[#7E641A] mt-2">{formatMoney(settlement?.pendingConfirmedExpenses)} confirmado · {formatMoney(settlement?.pendingPossibleExpenses)} posible</p></CardContent></Card>
            <Card className="card-elevated"><CardContent className="p-5"><div className="flex justify-between"><div><p className="text-xs uppercase tracking-[0.13em] text-muted-foreground">Liquidados</p><p className="font-mono-finance text-2xl mt-2">{settlement?.settledConcepts ?? 0}</p><p className="text-xs text-muted-foreground mt-2">Flujo real: {formatMoney(settlement?.settledNet)}</p>{settlement?.settledVarianceNet ? <p className={`text-xs mt-1 ${settlement.settledVarianceNet > 0 ? "text-[#276548]" : "text-[#A85831]"}`}>Ajuste vs. previsión: {settlement.settledVarianceNet > 0 ? "+" : ""}{formatMoney(settlement.settledVarianceNet)}</p> : null}</div><CircleCheckBig className="h-5 w-5 text-primary" /></div></CardContent></Card>
          </section>

          <ProjectionCards projection={summary.finalProjection} />

          {(summary.accountLiquidity ?? []).filter(account => account.balance === null).length ? <Card className="border-[#E9DAB6] bg-[#FFF9E9]"><CardContent className="py-3 px-4 flex gap-2 items-center"><Landmark className="h-4 w-4 text-[#916D19]" /><p className="text-sm text-[#62480D]">Registra el saldo inicial de cada cuenta para que el disponible se calcule desde ese punto y se ajuste con cada cobro o pago.</p></CardContent></Card> : null}

          <section className="grid gap-5 xl:grid-cols-2">
            <Card className="card-elevated overflow-hidden"><CardHeader className="p-5 sm:p-6 pb-3"><CardTitle className="font-display text-xl">Pendiente de cobrar</CardTitle><p className="text-sm text-muted-foreground mt-1">Ingresos fijos, extraordinarios y posibles todavía no cobrados.</p></CardHeader><CardContent className="p-0">{pendingIncome.length ? pendingIncome.map(line => <ConceptRow key={line.id} line={line} onSettle={setSelectedLine} onUndo={undo} />) : <div className="px-6 py-10 text-center text-sm text-muted-foreground">No quedan ingresos pendientes.</div>}</CardContent></Card>
            <Card className="card-elevated overflow-hidden"><CardHeader className="p-5 sm:p-6 pb-3"><CardTitle className="font-display text-xl">Pendiente de pagar</CardTitle><p className="text-sm text-muted-foreground mt-1">Recibos, tarjetas, préstamos, financiaciones y previsiones que aún no han salido.</p></CardHeader><CardContent className="p-0">{pendingExpenses.length ? pendingExpenses.map(line => <ConceptRow key={line.id} line={line} onSettle={setSelectedLine} onUndo={undo} />) : <div className="px-6 py-10 text-center text-sm text-muted-foreground">No quedan gastos pendientes.</div>}</CardContent></Card>
          </section>

          <Card className="card-elevated overflow-hidden"><CardHeader className="p-5 sm:p-6 pb-3"><CardTitle className="font-display text-xl">Ya liquidado</CardTitle><p className="text-sm text-muted-foreground mt-1">Puedes deshacer una operación si todavía no era definitiva.</p></CardHeader><CardContent className="p-0">{settled.length ? settled.map(line => <ConceptRow key={line.id} line={line} onSettle={setSelectedLine} onUndo={undo} />) : <div className="px-6 py-10 text-center text-sm text-muted-foreground">Todavía no has cobrado ni pagado conceptos este mes.</div>}</CardContent></Card>
          <Card className="border-[#D7E6DD] bg-[#F6FBF7]"><CardContent className="p-5 flex gap-3"><Wallet className="h-5 w-5 text-primary shrink-0" /><p className="text-sm text-muted-foreground">Al cambiar de mes, los conceptos recurrentes y las previsiones se presentan como pendientes en su periodo correspondiente. La liquidación queda guardada únicamente en el mes en que cobraste o pagaste.</p></CardContent></Card>
        </>
      ) : null}

      <SettlementDialog open={selectedLine !== null} onOpenChange={open => { if (!open) setSelectedLine(null); }} line={selectedLine} month={month} />
    </div>
  );
}

export default function SettlementPage() {
  return <DashboardLayout><SettlementContent /></DashboardLayout>;
}

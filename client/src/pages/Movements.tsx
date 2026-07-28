import DashboardLayout from "@/components/DashboardLayout";
import { RecurringDialog, type RecurringRecord } from "@/components/finance/RecurringDialog";
import { TransactionDialog, type TransactionKind, type TransactionRecord } from "@/components/finance/TransactionDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { currentMonth, formatDate, formatMoney, nextMonth, previousMonth, readableMonth } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, CreditCard, HandCoins, Plus, ReceiptText, Repeat2, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Segment = "all" | "income" | "expenses" | "recurring";

const kindLabels: Record<string, string> = {
  extra_income: "Ingreso extraordinario",
  possible_income: "Ingreso posible",
  extra_bill: "Recibo extraordinario",
  card_expense: "Gasto de tarjeta",
  manual_income: "Otro ingreso",
  manual_expense: "Otro gasto",
};

function MovementsContent() {
  const [month, setMonth] = useState(currentMonth);
  const [segment, setSegment] = useState<Segment>("all");
  const [transactionKind, setTransactionKind] = useState<TransactionKind | null>(null);
  const [recurringMode, setRecurringMode] = useState<"income" | "bill" | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionRecord | null>(null);
  const [selectedRecurring, setSelectedRecurring] = useState<RecurringRecord | null>(null);
  const utils = trpc.useUtils();
  const transactionsQuery = trpc.finance.transactions.list.useQuery({ month });
  const recurringQuery = trpc.finance.recurring.list.useQuery();
  const removeMutation = trpc.finance.transactions.remove.useMutation({
    onSuccess: () => { void Promise.all([utils.finance.transactions.list.invalidate(), utils.finance.monthlySummary.invalidate(), utils.finance.monthlyTrend.invalidate()]); toast.success("Movimiento eliminado"); },
    onError: error => toast.error(error.message),
  });
  const transactions = transactionsQuery.data ?? [];
  const recurring = recurringQuery.data ?? [];
  const visibleTransactions = useMemo(() => transactions.filter(item => {
    if (segment === "all") return true;
    if (segment === "income") return item.direction === "income";
    return item.direction === "expense";
  }), [transactions, segment]);
  const visibleRecurring = useMemo(() => recurring.filter(item => {
    if (segment === "income") return item.direction === "income";
    if (segment === "expenses") return item.direction === "expense";
    return true;
  }), [recurring, segment]);

  const transactionTotal = useMemo(() => visibleTransactions.reduce((total, row) => total + Number(row.amount), 0), [visibleTransactions]);
  const deleteTransaction = (id: number, description: string) => {
    if (window.confirm(`¿Eliminar definitivamente el movimiento “${description}”? Esta acción recalculará los balances y no se puede deshacer desde la aplicación.`)) {
      removeMutation.mutate({ id });
    }
  };

  return <div className="space-y-6 lg:space-y-8">
    <section className="flex flex-col gap-5 lg:flex-row lg:justify-between lg:items-end"><div><Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Registro mensual</Badge><h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">Ingresos y gastos</h1><p className="text-muted-foreground mt-2 leading-6 max-w-2xl">Gestiona los movimientos puntuales y las partidas que se incorporan automáticamente cada mes.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-xl" onClick={() => setRecurringMode("bill")}><Repeat2 className="h-4 w-4 mr-2" /> Recibo habitual</Button><Button className="rounded-xl shadow-lg shadow-primary/15" onClick={() => setTransactionKind("card_expense")}><Plus className="h-4 w-4 mr-2" /> Nuevo movimiento</Button></div></section>

    <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1 card-elevated"><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(previousMonth(month))}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-[138px] text-center text-sm font-medium capitalize">{readableMonth(month)}</span><Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => setMonth(nextMonth(month))}><ChevronRight className="h-4 w-4" /></Button></div><div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">{([ ["all", "Todo"], ["income", "Ingresos"], ["expenses", "Gastos"], ["recurring", "Habituales"] ] as const).map(([value, label]) => <Button key={value} size="sm" variant={segment === value ? "default" : "outline"} className="rounded-full shrink-0" onClick={() => setSegment(value)}>{label}</Button>)}</div></section>

    <section className="grid gap-4 lg:grid-cols-3"><Card className="border-[#CDE4D4] bg-[#EDF7EF] card-elevated"><CardContent className="p-5 flex gap-4"><span className="h-10 w-10 rounded-xl bg-[#D6EEDD] text-[#276548] flex items-center justify-center"><ArrowUpRight className="h-5 w-5" /></span><div><p className="text-xs uppercase tracking-[0.13em] text-[#4F785B]">Acción rápida</p><p className="font-display text-lg mt-1">Ingresos</p><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" className="bg-transparent border-[#AFCDB8]" onClick={() => setRecurringMode("income")}>Fijo</Button><Button size="sm" variant="outline" className="bg-transparent border-[#AFCDB8]" onClick={() => setTransactionKind("extra_income")}>Extra</Button></div></div></CardContent></Card><Card className="border-[#F0DFBC] bg-[#FFF6E5] card-elevated"><CardContent className="p-5 flex gap-4"><span className="h-10 w-10 rounded-xl bg-[#F8E6B8] text-[#785714] flex items-center justify-center"><CreditCard className="h-5 w-5" /></span><div><p className="text-xs uppercase tracking-[0.13em] text-[#87651A]">Actualización fácil</p><p className="font-display text-lg mt-1">Tarjetas</p><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" className="bg-transparent border-[#E4C579]" onClick={() => setTransactionKind("card_expense")}>Añadir gasto</Button></div></div></CardContent></Card><Card className="border-[#D9E1F1] bg-[#F0F4FC] card-elevated"><CardContent className="p-5 flex gap-4"><span className="h-10 w-10 rounded-xl bg-[#DCE6F7] text-[#4B618C] flex items-center justify-center"><Sparkles className="h-5 w-5" /></span><div><p className="text-xs uppercase tracking-[0.13em] text-[#536B97]">Escenario</p><p className="font-display text-lg mt-1">Ingresos posibles</p><div className="flex gap-2 mt-3"><Button size="sm" variant="outline" className="bg-transparent border-[#BFCBE4]" onClick={() => setTransactionKind("possible_income")}>Registrar posible</Button></div></div></CardContent></Card></section>

    {segment !== "recurring" ? <Card className="card-elevated"><CardHeader className="p-5 sm:p-6 flex-row items-start justify-between space-y-0"><div><CardTitle className="font-display text-xl">Movimientos de {readableMonth(month).toLowerCase()}</CardTitle><p className="text-sm text-muted-foreground mt-1">{visibleTransactions.length} movimiento(s) · {formatMoney(transactionTotal)}</p></div><ReceiptText className="h-5 w-5 text-primary" /></CardHeader><CardContent className="p-0 sm:p-2">{transactionsQuery.isLoading ? <div className="p-6 space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-14 rounded-xl" key={index} />)}</div> : visibleTransactions.length ? <div className="divide-y divide-border">{visibleTransactions.map(row => <div key={row.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-secondary/45 transition-colors"><span className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center ${row.direction === "income" ? "bg-[#E8F4EB] text-[#276548]" : "bg-[#FFF1E8] text-[#A85831]"}`}>{row.direction === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-sm font-medium truncate">{row.description}</p>{row.certainty === "possible" ? <Badge className="rounded-full bg-[#E1E8F8] text-[#4E6390] hover:bg-[#E1E8F8] text-[10px]">Posible</Badge> : null}</div><p className="text-xs text-muted-foreground mt-1 truncate">{kindLabels[row.kind]} · {row.categoryName ?? "Sin categoría"} · {formatDate(row.effectiveDate)}</p></div><div className="text-right shrink-0"><p className={`font-mono-finance text-sm ${row.direction === "income" ? "text-[#276548]" : ""}`}>{row.direction === "income" ? "+" : "−"}{formatMoney(row.amount, row.currency)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{row.currency}</p></div><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSelectedTransaction(row); setTransactionKind(row.kind); }}>Editar</Button><Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => deleteTransaction(row.id, row.description)} disabled={removeMutation.isPending}>Eliminar</Button></div>)}</div> : <div className="p-10 text-center"><CircleDollarSign className="h-8 w-8 mx-auto text-primary mb-3" /><p className="font-medium">No hay movimientos en este mes</p><p className="text-sm text-muted-foreground mt-1">Registra un ingreso, recibo extraordinario o gasto de tarjeta.</p><Button className="mt-4 rounded-xl" size="sm" onClick={() => setTransactionKind("card_expense")}><Plus className="h-4 w-4 mr-2" />Añadir movimiento</Button></div>}</CardContent></Card> : null}

    <Card className="card-elevated"><CardHeader className="p-5 sm:p-6 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:space-y-0"><div><CardTitle className="font-display text-xl">Partidas habituales</CardTitle><p className="text-sm text-muted-foreground mt-1">Se incluyen automáticamente todos los meses durante su vigencia.</p></div><div className="flex gap-2"><Button size="sm" variant="outline" className="rounded-lg" onClick={() => setRecurringMode("income")}><HandCoins className="h-4 w-4 mr-2" />Ingreso fijo</Button><Button size="sm" className="rounded-lg" onClick={() => setRecurringMode("bill")}><Plus className="h-4 w-4 mr-2" />Recibo habitual</Button></div></CardHeader><CardContent className="p-0 sm:p-2">{recurringQuery.isLoading ? <div className="p-6 space-y-3">{Array.from({ length: 3 }, (_, index) => <Skeleton className="h-14 rounded-xl" key={index} />)}</div> : visibleRecurring.length ? <div className="divide-y divide-border">{visibleRecurring.map(row => <div key={row.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-secondary/45 transition-colors"><span className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center ${row.direction === "income" ? "bg-[#E8F4EB] text-[#276548]" : "bg-[#FFF4E1] text-[#87601A]"}`}>{row.direction === "income" ? <ArrowUpRight className="h-4 w-4" /> : <CalendarClock className="h-4 w-4" />}</span><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{row.name}</p><p className="text-xs text-muted-foreground mt-1">{row.direction === "income" ? "Ingreso fijo" : "Recibo habitual"} · Día {row.dayOfMonth} · Desde {formatDate(row.startDate)}{row.endDate ? ` hasta ${formatDate(row.endDate)}` : ""}</p></div><div className="text-right"><p className={`font-mono-finance text-sm ${row.direction === "income" ? "text-[#276548]" : ""}`}>{row.direction === "income" ? "+" : "−"}{formatMoney(row.amount, row.currency)}</p>{row.certainty === "possible" ? <p className="text-[10px] text-[#4E6390] uppercase tracking-wider mt-1">Posible</p> : null}</div><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSelectedRecurring(row); setRecurringMode(row.direction === "income" ? "income" : "bill"); }}>Editar</Button></div>)}</div> : <div className="p-10 text-center"><Repeat2 className="h-8 w-8 mx-auto text-primary mb-3" /><p className="font-medium">Aún no hay partidas habituales</p><p className="text-sm text-muted-foreground mt-1">Empieza por añadir tus ingresos fijos y recibos recurrentes.</p></div>}</CardContent></Card>

    {transactionKind ? <TransactionDialog open={Boolean(transactionKind)} onOpenChange={open => { if (!open) { setTransactionKind(null); setSelectedTransaction(null); } }} kind={transactionKind} transaction={selectedTransaction} /> : null}
    {recurringMode ? <RecurringDialog open={Boolean(recurringMode)} onOpenChange={open => { if (!open) { setRecurringMode(null); setSelectedRecurring(null); } }} mode={recurringMode} recurring={selectedRecurring} /> : null}
  </div>;
}

export default function MovementsPage() { return <DashboardLayout><MovementsContent /></DashboardLayout>; }

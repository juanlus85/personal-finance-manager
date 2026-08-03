import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { currentMonth, formatDate, formatMoney, isoToday } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { ArrowDownRight, ArrowUpRight, CircleDollarSign, Loader2, ReceiptText, RotateCcw, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function CurrentMovementsContent() {
  const [direction, setDirection] = useState<"income" | "expense">("expense");
  const [date, setDate] = useState(isoToday());
  const [accountId, setAccountId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const utils = trpc.useUtils();
  const accountsQuery = trpc.finance.accounts.list.useQuery();
  const movementsQuery = trpc.finance.currentMovements.list.useQuery();
  const summaryQuery = trpc.finance.monthlySummary.useQuery({ month: currentMonth() });
  const activeAccounts = useMemo(() => (accountsQuery.data ?? []).filter(account => account.isActive), [accountsQuery.data]);
  const accountBalances = useMemo(() => new Map((summaryQuery.data?.accountLiquidity ?? []).map(account => [account.id, account])), [summaryQuery.data?.accountLiquidity]);
  const selectedAccount = activeAccounts.find(account => String(account.id) === accountId);

  const refreshFinance = async () => {
    await Promise.all([
      utils.finance.currentMovements.list.invalidate(),
      utils.finance.transactions.list.invalidate(),
      utils.finance.monthlySummary.invalidate(),
      utils.finance.monthlyTrend.invalidate(),
    ]);
  };

  const recordMutation = trpc.finance.currentMovements.record.useMutation({
    onSuccess: async () => {
      await refreshFinance();
      toast.success(direction === "income" ? "Ingreso registrado y saldo actualizado" : "Gasto registrado y saldo actualizado");
      setDescription("");
      setAmount("");
      setNotes("");
    },
    onError: error => toast.error(error.message),
  });
  const removeMutation = trpc.finance.currentMovements.remove.useMutation({
    onSuccess: async () => {
      await refreshFinance();
      toast.success("Movimiento revertido y saldo restaurado");
    },
    onError: error => toast.error(error.message),
  });

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!accountId) {
      toast.error("Selecciona la cuenta o efectivo que debe actualizarse.");
      return;
    }
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Indica un concepto y un importe válido.");
      return;
    }
    recordMutation.mutate({
      date,
      accountId: Number(accountId),
      description: description.trim(),
      direction,
      amount: parsedAmount,
      notes: notes.trim() || null,
    });
  };

  const revert = (id: number, label: string) => {
    if (window.confirm(`¿Revertir “${label}”? Se eliminará del historial y el saldo de la cuenta volverá al importe anterior.`)) {
      removeMutation.mutate({ id });
    }
  };

  const movements = movementsQuery.data ?? [];
  const totalIncomes = movements.filter(item => item.direction === "income").reduce((total, item) => total + Number(item.amount), 0);
  const totalExpenses = movements.filter(item => item.direction === "expense").reduce((total, item) => total + Number(item.amount), 0);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Registro inmediato</Badge>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">Movimientos corrientes</h1>
          <p className="text-muted-foreground mt-2 leading-6 max-w-2xl">Registra el dinero que realmente entra o sale. El saldo de la cuenta elegida se actualiza en el momento de guardar.</p>
        </div>
        <div className="rounded-2xl border border-[#CBDDD4] bg-[#ECF5F0] px-4 py-3 flex items-center gap-3">
          <WalletCards className="h-5 w-5 text-primary" />
          <div><p className="text-[10px] uppercase tracking-[0.13em] text-muted-foreground">Liquidez incluida</p><p className="font-mono-finance font-semibold mt-0.5">{formatMoney(summaryQuery.data?.availableLiquidity ?? 0)}</p></div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="card-elevated border-[#CDE4D4]">
          <CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-2xl">Nuevo movimiento</CardTitle><CardDescription>Usa la fecha real; no es una previsión ni una partida pendiente.</CardDescription></CardHeader>
          <CardContent className="p-5 sm:p-6 pt-0">
            <form onSubmit={submit} className="space-y-5">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/70 p-1.5">
                <Button type="button" variant={direction === "expense" ? "default" : "ghost"} className={direction === "expense" ? "bg-[#A85831] hover:bg-[#8B4324] rounded-lg" : "rounded-lg"} onClick={() => setDirection("expense")}><ArrowDownRight className="h-4 w-4 mr-2" />Gasto</Button>
                <Button type="button" variant={direction === "income" ? "default" : "ghost"} className={direction === "income" ? "bg-[#276548] hover:bg-[#1F513B] rounded-lg" : "rounded-lg"} onClick={() => setDirection("income")}><ArrowUpRight className="h-4 w-4 mr-2" />Ingreso</Button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2"><Label htmlFor="current-date">Fecha</Label><Input id="current-date" type="date" value={date} onChange={event => setDate(event.target.value)} required /></div>
                <div className="space-y-2"><Label htmlFor="current-account">Cuenta o efectivo</Label><select id="current-account" value={accountId} onChange={event => setAccountId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm" required><option value="">Selecciona una cuenta</option>{activeAccounts.map(account => { const balance = accountBalances.get(account.id); return <option key={account.id} value={account.id}>{account.name} · {account.currency}{balance?.balance !== null && balance?.balance !== undefined ? ` · ${formatMoney(balance.balance, account.currency)}` : ""}</option>; })}</select></div>
              </div>
              <div className="space-y-2"><Label htmlFor="current-description">Concepto</Label><Input id="current-description" autoFocus value={description} onChange={event => setDescription(event.target.value)} placeholder="Ej. Compra supermercado, nómina, retirada de efectivo…" required /></div>
              <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-end"><div className="space-y-2"><Label htmlFor="current-amount">Importe</Label><Input id="current-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" required /></div><div className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm text-muted-foreground">{selectedAccount?.currency ?? "Moneda de la cuenta"}</div></div>
              <div className="space-y-2"><Label htmlFor="current-notes">Notas</Label><Textarea id="current-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" className="min-h-20" /></div>
              <Button type="submit" className="w-full rounded-xl shadow-lg shadow-primary/15" disabled={recordMutation.isPending}>{recordMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Actualizando saldo</> : direction === "income" ? "Registrar ingreso y sumar saldo" : "Registrar gasto y restar saldo"}</Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <section className="grid gap-4 sm:grid-cols-2">
            <Card className="border-[#CDE4D4] bg-[#EDF7EF] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#4F785B]">Ingresos registrados</p><p className="font-mono-finance text-2xl mt-2 text-[#276548]">+{formatMoney(totalIncomes)}</p></CardContent></Card>
            <Card className="border-[#F0DFBC] bg-[#FFF6E5] card-elevated"><CardContent className="p-5"><p className="text-xs uppercase tracking-[0.13em] text-[#87651A]">Gastos registrados</p><p className="font-mono-finance text-2xl mt-2 text-[#A85831]">−{formatMoney(totalExpenses)}</p></CardContent></Card>
          </section>
          <Card className="card-elevated">
            <CardHeader className="p-5 sm:p-6 flex-row items-start justify-between space-y-0"><div><CardTitle className="font-display text-2xl">Historial corriente</CardTitle><CardDescription>Solo movimientos ya aplicados al saldo. Puedes revertir un registro si fue un error.</CardDescription></div><ReceiptText className="h-5 w-5 text-primary" /></CardHeader>
            <CardContent className="p-0 sm:p-2">
              {movementsQuery.isLoading ? <div className="p-6 space-y-3">{Array.from({ length: 4 }, (_, index) => <Skeleton className="h-16 rounded-xl" key={index} />)}</div> : movements.length ? <div className="divide-y divide-border">{movements.map(movement => <div key={movement.id} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-secondary/40 transition-colors"><span className={`h-10 w-10 rounded-xl shrink-0 flex items-center justify-center ${movement.direction === "income" ? "bg-[#E8F4EB] text-[#276548]" : "bg-[#FFF1E8] text-[#A85831]"}`}>{movement.direction === "income" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{movement.description}</p><p className="text-xs text-muted-foreground mt-1 truncate">{movement.accountName} · {formatDate(movement.effectiveDate)}{movement.notes ? ` · ${movement.notes}` : ""}</p></div><div className="text-right shrink-0"><p className={`font-mono-finance text-sm ${movement.direction === "income" ? "text-[#276548]" : "text-[#A85831]"}`}>{movement.direction === "income" ? "+" : "−"}{formatMoney(movement.amount, movement.currency)}</p><p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">Aplicado</p></div><Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" title="Revertir movimiento" onClick={() => revert(movement.id, movement.description)} disabled={removeMutation.isPending}><RotateCcw className="h-4 w-4" /></Button></div>)}</div> : <div className="p-10 text-center"><CircleDollarSign className="h-9 w-9 mx-auto text-primary mb-3" /><p className="font-medium">Aún no hay movimientos corrientes</p><p className="text-sm text-muted-foreground mt-1">Registra un gasto o un ingreso ya realizado para actualizar la cuenta.</p></div>}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

export default function CurrentMovementsPage() {
  return <DashboardLayout><CurrentMovementsContent /></DashboardLayout>;
}

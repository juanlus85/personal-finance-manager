import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, isoToday } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type SettlementLine = {
  id: string;
  source: "recurring" | "loan" | "financing" | "extra_income" | "possible_income" | "possible_expense" | "extra_bill" | "card_expense" | "card_forecast" | "manual_income" | "manual_expense";
  description: string;
  direction: "income" | "expense";
  certainty: "confirmed" | "possible";
  amount: number;
  currency: "EUR" | "USD";
  amountEur: number | null;
  defaultAccountId: number | null;
};

function settlementDateFor() {
  return isoToday();
}

export function SettlementDialog({
  open,
  onOpenChange,
  line,
  month,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: SettlementLine | null;
  month: string;
}) {
  const utils = trpc.useUtils();
  const { data: accounts = [] } = trpc.finance.accounts.list.useQuery();
  const [accountId, setAccountId] = useState("");
  const [settledOn, setSettledOn] = useState(settlementDateFor());
  const [actualAmount, setActualAmount] = useState("");
  const relevantAccounts = useMemo(
    () => accounts.filter(account => account.isActive && account.currency === line?.currency),
    [accounts, line?.currency],
  );

  useEffect(() => {
    if (!open || !line) return;
    const preferred = relevantAccounts.find(account => account.id === line.defaultAccountId) ?? relevantAccounts[0];
    setAccountId(preferred ? String(preferred.id) : "");
    setSettledOn(settlementDateFor());
    setActualAmount(String(line.amount));
  }, [open, line, month, relevantAccounts]);

  const settleMutation = trpc.finance.settlements.settle.useMutation({
    onSuccess: async () => {
      await utils.finance.monthlySummary.invalidate();
      toast.success(line?.direction === "income" ? "Ingreso cobrado y saldo actualizado" : "Gasto pagado y saldo actualizado");
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });

  if (!line) return null;
  const action = line.direction === "income" ? "Cobrar" : "Pagar";
  const missingAccounts = relevantAccounts.length === 0;
  const realAmount = Number(actualAmount) || 0;
  const variance = realAmount - line.amount;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountId) {
      toast.error(`Crea o activa una cuenta en ${line.currency} antes de ${action.toLowerCase()} este concepto.`);
      return;
    }
    const parsedActualAmount = Number(actualAmount);
    if (!Number.isFinite(parsedActualAmount) || parsedActualAmount <= 0) {
      toast.error("Indica un importe real válido.");
      return;
    }
    const actualAmountEur = line.currency === "EUR"
      ? parsedActualAmount
      : line.amountEur === null || line.amount <= 0
        ? null
        : parsedActualAmount * (line.amountEur / line.amount);
    settleMutation.mutate({
      month,
      conceptId: line.id,
      source: line.source,
      description: line.description,
      direction: line.direction,
      certainty: line.certainty,
      currency: line.currency,
      plannedAmount: line.amount,
      plannedAmountEur: line.amountEur,
      amount: parsedActualAmount,
      amountEur: actualAmountEur,
      accountId: Number(accountId),
      settledOn,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{action} concepto</DialogTitle>
          <DialogDescription>
            {action} <strong>{line.description}</strong> y confirma el importe real que se moverá en la cuenta elegida.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Importe previsto</p><p className="text-xs text-muted-foreground mt-1">La previsión se conserva aunque el importe real sea distinto.</p></div>
            <p className="font-mono-finance text-lg shrink-0">{formatMoney(line.amount, line.currency)}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="settlement-amount">Importe realmente {line.direction === "income" ? "cobrado" : "pagado"}</Label>
            <Input id="settlement-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={actualAmount} onChange={event => setActualAmount(event.target.value)} />
            {variance !== 0 ? <p className={`text-xs ${variance > 0 ? "text-[#276548]" : "text-[#A85831]"}`}>Diferencia frente a lo previsto: {variance > 0 ? "+" : ""}{formatMoney(variance, line.currency)}</p> : <p className="text-xs text-muted-foreground">Sin diferencia frente a la previsión.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="settlement-account">Cuenta o efectivo en {line.currency}</Label>
            <select id="settlement-account" value={accountId} onChange={event => setAccountId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-transparent px-3 text-sm" disabled={missingAccounts}>
              <option value="">Selecciona una cuenta</option>
              {relevantAccounts.map(account => <option key={account.id} value={account.id}>{account.name}{account.institution ? ` · ${account.institution}` : ""}</option>)}
            </select>
            {missingAccounts ? <p className="text-xs text-destructive">No hay cuentas activas en {line.currency}. Añade una desde Cuentas y deudas.</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="settlement-date">Fecha de confirmación</Label>
            <Input id="settlement-date" type="date" max={isoToday()} value={settledOn} onChange={event => setSettledOn(event.target.value)} />
            <p className="text-xs text-muted-foreground">El saldo de la cuenta se actualiza inmediatamente al confirmar, aunque el concepto pertenezca a un mes futuro.</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={settleMutation.isPending || missingAccounts}>{settleMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando</> : action}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

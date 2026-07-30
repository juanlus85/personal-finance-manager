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
  source: "recurring" | "loan" | "financing" | "extra_income" | "possible_income" | "extra_bill" | "card_expense" | "manual_income" | "manual_expense";
  description: string;
  direction: "income" | "expense";
  certainty: "confirmed" | "possible";
  amount: number;
  currency: "EUR" | "USD";
  amountEur: number | null;
  defaultAccountId: number | null;
};

function settlementDateFor(month: string) {
  const today = isoToday();
  return today.startsWith(month) ? today : `${month}-01`;
}

function monthEndFor(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
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
  const [settledOn, setSettledOn] = useState(settlementDateFor(month));
  const relevantAccounts = useMemo(
    () => accounts.filter(account => account.isActive && account.currency === line?.currency),
    [accounts, line?.currency],
  );

  useEffect(() => {
    if (!open || !line) return;
    const preferred = relevantAccounts.find(account => account.id === line.defaultAccountId) ?? relevantAccounts[0];
    setAccountId(preferred ? String(preferred.id) : "");
    setSettledOn(settlementDateFor(month));
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

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accountId) {
      toast.error(`Crea o activa una cuenta en ${line.currency} antes de ${action.toLowerCase()} este concepto.`);
      return;
    }
    settleMutation.mutate({
      month,
      conceptId: line.id,
      source: line.source,
      description: line.description,
      direction: line.direction,
      certainty: line.certainty,
      currency: line.currency,
      amount: line.amount,
      amountEur: line.amountEur,
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
            {action} <strong>{line.description}</strong> por {formatMoney(line.amount, line.currency)} y refleja el movimiento en la cuenta elegida.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 flex items-center justify-between gap-4">
            <div><p className="text-sm font-medium">Impacto consolidado</p><p className="text-xs text-muted-foreground mt-1">Se conserva la planificación del mes; solo cambia su estado a liquidado.</p></div>
            <p className="font-mono-finance text-lg shrink-0">{line.amountEur === null ? "Pendiente de cambio" : formatMoney(line.amountEur)}</p>
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
            <Label htmlFor="settlement-date">Fecha de {line.direction === "income" ? "cobro" : "pago"}</Label>
            <Input id="settlement-date" type="date" min={`${month}-01`} max={monthEndFor(month)} value={settledOn} onChange={event => setSettledOn(event.target.value)} />
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

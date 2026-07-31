import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { isoToday } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export type TransactionKind = "extra_income" | "possible_income" | "possible_expense" | "extra_bill" | "card_expense" | "card_forecast" | "manual_income" | "manual_expense";

export type TransactionRecord = {
  id: number;
  categoryId: number | null;
  accountId: number | null;
  description: string;
  direction: "income" | "expense";
  kind: TransactionKind;
  certainty: "confirmed" | "possible";
  currency: "EUR" | "USD";
  amount: string;
  exchangeRateToEur: string | null;
  effectiveDate: string;
  notes: string | null;
};

const KIND_DETAILS: Record<TransactionKind, { title: string; description: string; direction: "income" | "expense"; label: string }> = {
  extra_income: { title: "Ingreso extraordinario", description: "Registra un ingreso confirmado que no se repite automáticamente.", direction: "income", label: "Ingreso" },
  possible_income: { title: "Ingreso posible", description: "Se mostrará únicamente en el balance incluyendo posibles.", direction: "income", label: "Ingreso posible" },
  possible_expense: { title: "Gasto posible", description: "Se mostrará únicamente en el balance incluyendo posibles hasta que se confirme.", direction: "expense", label: "Gasto posible" },
  extra_bill: { title: "Recibo extraordinario", description: "Registra un gasto puntual fuera de los recibos habituales.", direction: "expense", label: "Recibo" },
  card_expense: { title: "Gasto de tarjeta", description: "Registra o actualiza un gasto imputado a la tarjeta este mes.", direction: "expense", label: "Gasto de tarjeta" },
  card_forecast: { title: "Previsión de tarjeta", description: "Registra el pago estimado de una tarjeta para el mes seleccionado.", direction: "expense", label: "Previsión de tarjeta" },
  manual_income: { title: "Otro ingreso", description: "Registra un ingreso confirmado de forma manual.", direction: "income", label: "Ingreso" },
  manual_expense: { title: "Otro gasto", description: "Registra un gasto confirmado de forma manual.", direction: "expense", label: "Gasto" },
};

export function TransactionDialog({
  open,
  onOpenChange,
  kind,
  transaction,
  onSaved,
  initialDate,
  initialDescription,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: TransactionKind;
  transaction?: TransactionRecord | null;
  onSaved?: () => void;
  initialDate?: string;
  initialDescription?: string;
}) {
  const details = KIND_DETAILS[kind];
  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.finance.categories.list.useQuery({ direction: details.direction });
  const { data: accounts = [] } = trpc.finance.accounts.list.useQuery();
  const saveMutation = trpc.finance.transactions.save.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.finance.transactions.list.invalidate(), utils.finance.monthlySummary.invalidate()]);
      toast.success(transaction ? `${details.label} actualizado` : `${details.label} guardado`);
      onSaved?.();
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [exchangeRate, setExchangeRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(isoToday());
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [notes, setNotes] = useState("");

  const relevantAccounts = useMemo(() => accounts.filter(account => account.isActive && account.currency === currency), [accounts, currency]);

  useEffect(() => {
    if (!open) return;
    setDescription(transaction?.description ?? initialDescription ?? "");
    setAmount(transaction?.amount ?? "");
    setCurrency(transaction?.currency ?? "EUR");
    setExchangeRate(transaction?.exchangeRateToEur ?? "");
    setEffectiveDate(transaction?.effectiveDate ?? initialDate ?? isoToday());
    setCategoryId(transaction?.categoryId ? String(transaction.categoryId) : "");
    setAccountId(transaction?.accountId ? String(transaction.accountId) : "");
    setNotes(transaction?.notes ?? "");
  }, [open, kind, transaction, initialDate, initialDescription]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedAmount = Number(amount);
    if (!description.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Indica un concepto y un importe válido.");
      return;
    }
    if (currency === "USD" && (!Number(exchangeRate) || Number(exchangeRate) <= 0)) {
      toast.error("Indica el tipo de cambio USD → EUR aplicado a este movimiento.");
      return;
    }

    saveMutation.mutate({
      id: transaction?.id,
      description: description.trim(),
      direction: details.direction,
      kind,
      certainty: kind === "possible_income" || kind === "possible_expense" ? "possible" : "confirmed",
      amount: parsedAmount,
      currency,
      exchangeRateToEur: currency === "USD" ? Number(exchangeRate) : null,
      effectiveDate,
      categoryId: categoryId ? Number(categoryId) : null,
      accountId: accountId ? Number(accountId) : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display text-2xl">{transaction ? `Editar: ${details.title}` : details.title}</DialogTitle><DialogDescription>{details.description}</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4 pt-2">
          <div className="space-y-2"><Label htmlFor="transaction-description">Concepto</Label><Input id="transaction-description" autoFocus value={description} onChange={event => setDescription(event.target.value)} placeholder="Ej. Reparación, compra, alquiler…" /></div>
          <div className="grid grid-cols-[1fr_110px] gap-3"><div className="space-y-2"><Label htmlFor="transaction-amount">Importe</Label><Input id="transaction-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></div><div className="space-y-2"><Label htmlFor="transaction-currency">Moneda</Label><select id="transaction-currency" value={currency} onChange={event => { setCurrency(event.target.value as "EUR" | "USD"); setAccountId(""); }} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="EUR">EUR</option><option value="USD">USD</option></select></div></div>
          {currency === "USD" ? <div className="space-y-2"><Label htmlFor="transaction-rate">Cambio aplicado (1 USD = EUR)</Label><Input id="transaction-rate" type="number" inputMode="decimal" min="0.000001" step="0.000001" value={exchangeRate} onChange={event => setExchangeRate(event.target.value)} placeholder="0,92" /></div> : null}
          <div className="grid sm:grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="transaction-date">Fecha</Label><Input id="transaction-date" type="date" value={effectiveDate} onChange={event => setEffectiveDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="transaction-category">Categoría</Label><select id="transaction-category" value={categoryId} onChange={event => setCategoryId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Sin categoría</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div>
          <div className="space-y-2"><Label htmlFor="transaction-account">Cuenta asociada</Label><select id="transaction-account" value={accountId} onChange={event => setAccountId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Sin cuenta asociada</option>{relevantAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="transaction-notes">Notas</Label><Textarea id="transaction-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" className="min-h-20" /></div>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando</> : "Guardar"}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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

export type RecurringRecord = {
  id: number;
  categoryId: number | null;
  accountId: number | null;
  name: string;
  direction: "income" | "expense";
  kind: "fixed_income" | "recurring_bill";
  certainty: "confirmed" | "possible";
  currency: "EUR" | "USD";
  amount: string;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
};

export function RecurringDialog({
  open,
  onOpenChange,
  mode,
  recurring,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "income" | "bill";
  recurring?: RecurringRecord | null;
  onSaved?: () => void;
}) {
  const direction = mode === "income" ? "income" : "expense" as const;
  const utils = trpc.useUtils();
  const { data: categories = [] } = trpc.finance.categories.list.useQuery({ direction });
  const { data: accounts = [] } = trpc.finance.accounts.list.useQuery();
  const saveMutation = trpc.finance.recurring.save.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.finance.recurring.list.invalidate(), utils.finance.monthlySummary.invalidate()]);
      toast.success(recurring ? (mode === "income" ? "Ingreso fijo actualizado" : "Recibo habitual actualizado") : (mode === "income" ? "Ingreso fijo guardado" : "Recibo habitual guardado"));
      onSaved?.();
      onOpenChange(false);
    },
    onError: error => toast.error(error.message),
  });
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState<"EUR" | "USD">("EUR");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [startDate, setStartDate] = useState(isoToday());
  const [endDate, setEndDate] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isPossible, setIsPossible] = useState(false);
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);
  const relevantAccounts = useMemo(() => accounts.filter(account => account.isActive && account.currency === currency), [accounts, currency]);

  useEffect(() => {
    if (!open) return;
    setName(recurring?.name ?? ""); setAmount(recurring?.amount ?? ""); setCurrency(recurring?.currency ?? "EUR"); setDayOfMonth(String(recurring?.dayOfMonth ?? 1)); setStartDate(recurring?.startDate ?? isoToday()); setEndDate(recurring?.endDate ?? ""); setCategoryId(recurring?.categoryId ? String(recurring.categoryId) : ""); setAccountId(recurring?.accountId ? String(recurring.accountId) : ""); setIsPossible(recurring?.certainty === "possible"); setNotes(recurring?.notes ?? ""); setIsActive(recurring?.isActive ?? true);
  }, [open, mode, recurring]);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !Number(amount) || Number(amount) <= 0) { toast.error("Indica un concepto y un importe válido."); return; }
    if (endDate && endDate < startDate) { toast.error("La fecha de finalización no puede ser anterior al inicio."); return; }
    saveMutation.mutate({
      id: recurring?.id, name: name.trim(), direction, kind: mode === "income" ? "fixed_income" : "recurring_bill", certainty: mode === "income" && isPossible ? "possible" : "confirmed", currency, amount: Number(amount), dayOfMonth: Number(dayOfMonth), startDate, endDate: endDate || null, categoryId: categoryId ? Number(categoryId) : null, accountId: accountId ? Number(accountId) : null, notes: notes.trim() || null, isActive,
    });
  };

  const title = `${recurring ? "Editar" : "Nuevo"} ${mode === "income" ? "ingreso fijo" : "recibo habitual"}`;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle className="font-display text-2xl">{title}</DialogTitle><DialogDescription>{mode === "income" ? "Se incorporará automáticamente cada mes mientras esté activo." : "Aparecerá automáticamente cada mes dentro de su período de vigencia."}</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4 pt-2"><div className="space-y-2"><Label htmlFor="recurring-name">Concepto</Label><Input id="recurring-name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder={mode === "income" ? "Ej. Nómina, alquiler Ecuador…" : "Ej. Internet, comunidad…"} /></div><div className="grid grid-cols-[1fr_110px] gap-3"><div className="space-y-2"><Label htmlFor="recurring-amount">Importe mensual</Label><Input id="recurring-amount" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" /></div><div className="space-y-2"><Label htmlFor="recurring-currency">Moneda</Label><select id="recurring-currency" value={currency} onChange={event => { setCurrency(event.target.value as "EUR" | "USD"); setAccountId(""); }} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="EUR">EUR</option><option value="USD">USD</option></select></div></div><div className="grid sm:grid-cols-3 gap-3"><div className="space-y-2"><Label htmlFor="recurring-day">Día de cargo</Label><Input id="recurring-day" type="number" min="1" max="31" value={dayOfMonth} onChange={event => setDayOfMonth(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="recurring-start">Desde</Label><Input id="recurring-start" type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="recurring-end">Hasta</Label><Input id="recurring-end" type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></div></div><div className="grid sm:grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="recurring-category">Categoría</Label><select id="recurring-category" value={categoryId} onChange={event => setCategoryId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Sin categoría</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="recurring-account">Cuenta asociada</Label><select id="recurring-account" value={accountId} onChange={event => setAccountId(event.target.value)} className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"><option value="">Sin cuenta asociada</option>{relevantAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></div></div>{mode === "income" ? <label className="flex items-start gap-3 rounded-xl bg-[#EDF1FA] p-3 text-sm"><input type="checkbox" checked={isPossible} onChange={event => setIsPossible(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><strong>Ingreso posible</strong><span className="block text-muted-foreground mt-0.5">No entrará en el balance confirmado, pero sí en el escenario con posibles.</span></span></label> : null}<label className="flex items-start gap-3 rounded-xl bg-secondary p-3 text-sm"><input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span><strong>Partida activa</strong><span className="block text-muted-foreground mt-0.5">Desactívala para conservar el histórico sin incorporarla a los nuevos meses.</span></span></label><div className="space-y-2"><Label htmlFor="recurring-notes">Notas</Label><Textarea id="recurring-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Opcional" className="min-h-20" /></div><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Guardando</> : "Guardar"}</Button></div></form></DialogContent></Dialog>;
}

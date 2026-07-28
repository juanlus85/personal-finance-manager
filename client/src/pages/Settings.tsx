import DashboardLayout from "@/components/DashboardLayout";
import { CategoryDialog, ExchangeRateDialog, type CategoryRecord, type ExchangeRateRecord } from "@/components/finance/SettingsDialogs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/finance";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, CircleDollarSign, Download, KeyRound, Pencil, Plus, ShieldCheck, Tag, Trash2, Upload, WalletCards } from "lucide-react";
import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

const BUILD_VERSION = import.meta.env.VITE_APP_VERSION ?? "v0.1.0";
const BUILD_DATE = import.meta.env.VITE_BUILD_DATE
  ? new Date(import.meta.env.VITE_BUILD_DATE).toLocaleString("es-ES", { timeZone: "Europe/Madrid", dateStyle: "short", timeStyle: "short" })
  : "entorno de desarrollo";
const BUILD_LABEL = `${BUILD_VERSION} · ${BUILD_DATE}`;

function SettingsContent() {
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<CategoryRecord | null>(null);
  const [selectedRate, setSelectedRate] = useState<ExchangeRateRecord | null>(null);
  const [defaultDirection, setDefaultDirection] = useState<"income" | "expense">("expense");
  const importInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();
  const incomeCategoriesQuery = trpc.finance.categories.list.useQuery({ direction: "income", includeInactive: true });
  const expenseCategoriesQuery = trpc.finance.categories.list.useQuery({ direction: "expense", includeInactive: true });
  const ratesQuery = trpc.finance.exchangeRates.list.useQuery();
  const exportQuery = trpc.finance.exportData.useQuery(undefined, { enabled: false });
  const importMutation = trpc.finance.importData.useMutation({
    onSuccess: async result => {
      await Promise.all([
        utils.finance.categories.list.invalidate(),
        utils.finance.accounts.list.invalidate(),
        utils.finance.exchangeRates.list.invalidate(),
        utils.finance.loans.list.invalidate(),
        utils.finance.financings.list.invalidate(),
        utils.finance.recurring.list.invalidate(),
        utils.finance.transactions.list.invalidate(),
        utils.finance.debts.list.invalidate(),
        utils.finance.monthlySummary.invalidate(),
        utils.finance.monthlyTrend.invalidate(),
      ]);
      toast.success(`Importación completada: ${result.imported.transactions} movimientos y ${result.imported.loans} préstamos restaurados.`);
    },
    onError: error => toast.error(error.message),
  });
  const removeRateMutation = trpc.finance.exchangeRates.remove.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.finance.exchangeRates.list.invalidate(), utils.finance.monthlySummary.invalidate(), utils.finance.monthlyTrend.invalidate()]);
      toast.success("Tipo de cambio eliminado");
    },
    onError: error => toast.error(error.message),
  });
  const rates = ratesQuery.data ?? [];
  const hasCurrentRate = useMemo(() => rates.some(rate => rate.fromCurrency === "USD"), [rates]);
  const newCategory = (direction: "income" | "expense") => { setSelectedCategory(null); setDefaultDirection(direction); setCategoryDialogOpen(true); };
  const editCategory = (category: CategoryRecord) => { setSelectedCategory(category); setDefaultDirection(category.direction); setCategoryDialogOpen(true); };
  const newRate = () => { setSelectedRate(null); setRateDialogOpen(true); };
  const editRate = (rate: ExchangeRateRecord) => { setSelectedRate(rate); setRateDialogOpen(true); };
  const deleteRate = (rate: ExchangeRateRecord) => {
    if (window.confirm(`¿Eliminar el tipo de cambio USD → EUR aplicable desde ${formatDate(rate.effectiveOn)}? Los importes históricos que dependan de él dejarán de consolidarse si no existe otro cambio anterior.`)) {
      removeRateMutation.mutate({ id: rate.id });
    }
  };
  const downloadBackup = async () => {
    const result = await exportQuery.refetch();
    if (!result.data) {
      toast.error("No se pudo preparar la copia de seguridad.");
      return;
    }
    const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lumen-finanzas-${result.data.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Copia de seguridad descargada");
  };
  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La copia supera el límite de 10 MB.");
      return;
    }
    try {
      const content = await file.text();
      importMutation.mutate({ backup: JSON.parse(content) });
    } catch {
      toast.error("No se pudo leer el archivo JSON seleccionado.");
    }
  };
  const CategoryList = ({ title, subtitle, categories, direction }: { title: string; subtitle: string; categories: CategoryRecord[]; direction: "income" | "expense" }) => <Card className="card-elevated"><CardHeader className="p-5 sm:p-6 flex-row items-start justify-between space-y-0"><div><CardTitle className="font-display text-xl">{title}</CardTitle><p className="text-sm text-muted-foreground mt-1">{subtitle}</p></div><Button size="sm" variant="outline" className="rounded-lg" onClick={() => newCategory(direction)}><Plus className="h-4 w-4 mr-2" />Añadir</Button></CardHeader><CardContent className="p-0 sm:p-2">{categories.length ? <div className="divide-y divide-border">{categories.map(category => <div key={category.id} className="px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-secondary/30 transition-colors"><span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: category.color }} /><div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{category.name}</p><p className="text-xs text-muted-foreground mt-0.5">{category.isActive ? "Disponible para nuevos registros" : "Inactiva · disponible en histórico"}</p></div><Button variant="ghost" size="icon" className="rounded-lg" onClick={() => editCategory(category)}><Pencil className="h-4 w-4" /></Button></div>)}</div> : <div className="p-8 text-center text-sm text-muted-foreground">Aún no hay categorías. Crea una para organizar los registros.</div>}</CardContent></Card>;
  return <div className="space-y-6 lg:space-y-8"><section><Badge variant="outline" className="rounded-full border-[#CBDDD4] bg-[#ECF5F0] text-[#235545] font-medium">Preferencias de la aplicación</Badge><h1 className="font-display text-3xl sm:text-4xl font-semibold tracking-[-0.04em] mt-3">Configuración</h1><p className="text-muted-foreground mt-2 leading-6 max-w-2xl">Personaliza categorías, tipos de cambio y los parámetros que aseguran un seguimiento financiero consistente.</p></section>
    <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]"><Card className="card-elevated"><CardHeader className="p-5 sm:p-6 flex-row items-start justify-between space-y-0"><div><CardTitle className="font-display text-xl">Conversión USD → EUR</CardTitle><p className="text-sm text-muted-foreground mt-1">Necesaria para consolidar los ingresos de alquiler en Ecuador y saldos en USD.</p></div><CircleDollarSign className="h-5 w-5 text-primary" /></CardHeader><CardContent className="p-0 sm:p-2">{ratesQuery.isLoading ? <div className="p-6 space-y-3"><Skeleton className="h-14 rounded-xl" /><Skeleton className="h-14 rounded-xl" /></div> : rates.length ? <div className="divide-y divide-border">{rates.map(rate => <div key={rate.id} className="px-4 sm:px-5 py-3.5 flex items-center gap-3 hover:bg-secondary/30 transition-colors"><span className="h-10 w-10 rounded-xl bg-[#EDF1FA] text-[#536B97] flex items-center justify-center"><WalletCards className="h-4 w-4" /></span><div className="flex-1"><p className="text-sm font-medium">1 USD = {Number(rate.rate).toLocaleString("es-ES", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} EUR</p><p className="text-xs text-muted-foreground mt-1">Aplicable desde {formatDate(rate.effectiveOn)}{rate.note ? ` · ${rate.note}` : ""}</p></div><Button variant="ghost" size="icon" className="rounded-lg" onClick={() => editRate(rate)} aria-label="Editar tipo de cambio"><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" className="rounded-lg text-muted-foreground hover:text-destructive" onClick={() => deleteRate(rate)} disabled={removeRateMutation.isPending} aria-label="Eliminar tipo de cambio"><Trash2 className="h-4 w-4" /></Button></div>)}</div> : <div className="p-8 text-center"><p className="font-medium">Aún no hay tipos de cambio</p><p className="text-sm text-muted-foreground mt-1">Añade el primer cambio USD → EUR para consolidar los importes en dólares.</p></div>}<div className="p-4 sm:px-5 border-t border-border"><Button size="sm" className="rounded-lg" onClick={newRate}><Plus className="h-4 w-4 mr-2" />Añadir cambio USD → EUR</Button></div></CardContent></Card><Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Estado de consolidación</CardTitle><p className="text-sm text-muted-foreground mt-1">Control de los elementos que intervienen en los totales presentados.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0 space-y-4"><div className="flex gap-3 items-start"><span className="h-8 w-8 rounded-lg bg-[#EAF4EC] text-[#276548] flex items-center justify-center shrink-0"><CheckCircle2 className="h-4 w-4" /></span><div><p className="text-sm font-medium">EUR como moneda base</p><p className="text-xs text-muted-foreground mt-1">Todos los balances se expresan en EUR una vez aplicado el cambio correspondiente.</p></div></div><div className="flex gap-3 items-start"><span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${hasCurrentRate ? "bg-[#EAF4EC] text-[#276548]" : "bg-[#FFF4E1] text-[#88601A]"}`}><CircleDollarSign className="h-4 w-4" /></span><div><p className="text-sm font-medium">Tipo de cambio USD → EUR</p><p className="text-xs text-muted-foreground mt-1">{hasCurrentRate ? "Hay al menos un cambio registrado para convertir importes en USD." : "Añade un tipo de cambio antes de incluir USD en los balances consolidados."}</p></div></div><div className="flex gap-3 items-start"><span className="h-8 w-8 rounded-lg bg-[#EAF4EC] text-[#276548] flex items-center justify-center shrink-0"><CheckCircle2 className="h-4 w-4" /></span><div><p className="text-sm font-medium">Vencimientos automáticos</p><p className="text-xs text-muted-foreground mt-1">Préstamos y financiaciones se excluyen de los meses posteriores a su fecha de finalización.</p></div></div></CardContent></Card></section>
    <section className="grid gap-5 xl:grid-cols-2">{incomeCategoriesQuery.isLoading ? <Skeleton className="h-72 rounded-2xl" /> : <CategoryList title="Categorías de ingresos" subtitle="Aparecen al registrar ingresos fijos, extraordinarios o posibles." categories={incomeCategoriesQuery.data ?? []} direction="income" />}{expenseCategoriesQuery.isLoading ? <Skeleton className="h-72 rounded-2xl" /> : <CategoryList title="Categorías de gastos" subtitle="Se usan en recibos, tarjetas y gastos extraordinarios." categories={expenseCategoriesQuery.data ?? []} direction="expense" />}</section>
    <section className="grid gap-5 xl:grid-cols-2"><Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Acceso y privacidad</CardTitle><p className="text-sm text-muted-foreground mt-1">Este espacio es exclusivamente personal.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0 space-y-4"><div className="flex items-start gap-3 rounded-xl bg-[#EAF4EC] p-4"><ShieldCheck className="h-5 w-5 text-[#276548] shrink-0 mt-0.5" /><div><p className="text-sm font-medium">Acceso limitado a una cuenta Google</p><p className="text-xs text-muted-foreground mt-1">En producción solo se autorizará el correo <strong>juanlu85@gmail.com</strong>. El servidor valida la identidad y el correo verificado antes de crear la sesión.</p></div></div><div className="flex items-start gap-3 rounded-xl bg-secondary p-4"><KeyRound className="h-5 w-5 text-primary shrink-0 mt-0.5" /><div><p className="text-sm font-medium">Credenciales protegidas</p><p className="text-xs text-muted-foreground mt-1">Las claves OAuth y de sesión se configuran como variables de entorno del VPS y nunca se guardan en el repositorio.</p></div></div></CardContent></Card><Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Información de la aplicación</CardTitle><p className="text-sm text-muted-foreground mt-1">Referencia para comprobar la versión desplegada.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0"><div className="rounded-xl border border-border p-4"><p className="text-xs uppercase tracking-[0.13em] text-muted-foreground">Versión y compilación</p><p className="font-mono-finance text-sm mt-2">Versión {BUILD_LABEL}</p><p className="text-xs text-muted-foreground mt-2">Zona horaria de negocio: Europe/Madrid (España).</p></div></CardContent></Card></section>
    <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]"><Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Portabilidad de datos</CardTitle><p className="text-sm text-muted-foreground mt-1">Descarga una copia completa de tus registros para conservarla o moverla a otro entorno.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground max-w-md">La exportación incluye cuentas, saldos, movimientos, categorías, préstamos, cuotas, financiaciones, tipos de cambio y deudas. No incluye credenciales ni sesiones.</p><Button className="rounded-xl shrink-0" onClick={() => void downloadBackup()} disabled={exportQuery.isFetching}>{exportQuery.isFetching ? "Preparando…" : <><Download className="h-4 w-4 mr-2" />Descargar JSON</>}</Button></CardContent></Card><Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Restaurar una copia</CardTitle><p className="text-sm text-muted-foreground mt-1">Importa un archivo JSON generado por esta aplicación.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0 space-y-4"><p className="text-xs text-muted-foreground">La importación añade los registros del archivo a tu espacio privado y no elimina información existente. Comprueba que el archivo sea una copia de Lumen Finanzas antes de continuar.</p><input ref={importInputRef} type="file" accept="application/json,.json" className="hidden" onChange={event => void importBackup(event)} /><Button variant="outline" className="rounded-xl" onClick={() => importInputRef.current?.click()} disabled={importMutation.isPending}>{importMutation.isPending ? "Importando…" : <><Upload className="h-4 w-4 mr-2" />Importar JSON</>}</Button></CardContent></Card></section>
    <CategoryDialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen} category={selectedCategory} defaultDirection={defaultDirection} />
    <ExchangeRateDialog open={rateDialogOpen} onOpenChange={setRateDialogOpen} rate={selectedRate} />
  </div>;
}

export default function SettingsPage() { return <DashboardLayout><SettingsContent /></DashboardLayout>; }

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { KeyRound, Plus, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function UserAccessManager() {
  const utils = trpc.useUtils();
  const usersQuery = trpc.auth.users.list.useQuery();
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const createMutation = trpc.auth.users.create.useMutation({
    onSuccess: async () => {
      setDisplayName("");
      setUsername("");
      setPassword("");
      await utils.auth.users.list.invalidate();
      toast.success("Usuario creado. Comparte la contraseña por un canal seguro.");
    },
    onError: error => toast.error(error.message),
  });
  const updateMutation = trpc.auth.users.update.useMutation({
    onSuccess: async () => {
      await utils.auth.users.list.invalidate();
      toast.success("Acceso actualizado.");
    },
    onError: error => toast.error(error.message),
  });

  const createUser = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createMutation.mutate({ displayName, username, password, role: "user" });
  };

  const resetPassword = (id: number, username: string) => {
    const nextPassword = window.prompt(`Nueva contraseña para ${username} (mínimo 10 caracteres):`);
    if (!nextPassword) return;
    if (nextPassword.length < 10) {
      toast.error("La contraseña debe tener al menos 10 caracteres.");
      return;
    }
    updateMutation.mutate({ id, password: nextPassword });
  };

  return <section className="grid gap-5 xl:grid-cols-[1.15fr_1fr]">
    <Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Usuarios con acceso</CardTitle><p className="text-sm text-muted-foreground mt-1">Las contraseñas se guardan como hashes seguros y nunca aparecen en copias de seguridad.</p></CardHeader><CardContent className="p-0 sm:p-2">{usersQuery.isLoading ? <p className="p-6 text-sm text-muted-foreground">Cargando accesos…</p> : <div className="divide-y divide-border">{(usersQuery.data ?? []).map(user => <div key={user.id} className="px-4 sm:px-5 py-3.5 flex flex-wrap items-center gap-3"><span className="h-9 w-9 rounded-xl bg-[#EAF4EC] text-[#276548] flex items-center justify-center"><UserRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{user.name || user.username}</p><p className="text-xs text-muted-foreground mt-1">@{user.username} · {user.role === "admin" ? "Administrador" : "Usuario"}{user.isActive ? " · Activo" : " · Inactivo"}</p></div>{user.role === "admin" ? <ShieldCheck className="h-4 w-4 text-primary" /> : null}<div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => resetPassword(user.id, user.username)} disabled={updateMutation.isPending}>Contraseña</Button><Button variant="outline" size="sm" onClick={() => updateMutation.mutate({ id: user.id, isActive: !user.isActive })} disabled={updateMutation.isPending}>{user.isActive ? "Desactivar" : "Activar"}</Button></div></div>)}</div>}</CardContent></Card>
    <Card className="card-elevated"><CardHeader className="p-5 sm:p-6"><CardTitle className="font-display text-xl">Crear usuario</CardTitle><p className="text-sm text-muted-foreground mt-1">El nuevo usuario empezará con un espacio financiero independiente.</p></CardHeader><CardContent className="p-5 sm:p-6 pt-0"><form onSubmit={createUser} className="space-y-3"><div className="space-y-1.5"><Label htmlFor="access-name">Nombre</Label><Input id="access-name" value={displayName} onChange={event => setDisplayName(event.target.value)} required /></div><div className="space-y-1.5"><Label htmlFor="access-username">Usuario</Label><Input id="access-username" value={username} onChange={event => setUsername(event.target.value)} pattern="[A-Za-z0-9._-]{3,80}" required /></div><div className="space-y-1.5"><Label htmlFor="access-password">Contraseña inicial</Label><Input id="access-password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={10} required /></div><Button type="submit" className="w-full rounded-xl" disabled={createMutation.isPending}>{createMutation.isPending ? "Creando…" : <><Plus className="h-4 w-4 mr-2" />Crear acceso</>}</Button><p className="text-xs text-muted-foreground flex gap-2"><KeyRound className="h-3.5 w-3.5 shrink-0 mt-0.5" />Entrega la contraseña mediante un canal privado; no se puede recuperar desde la aplicación.</p></form></CardContent></Card>
  </section>;
}

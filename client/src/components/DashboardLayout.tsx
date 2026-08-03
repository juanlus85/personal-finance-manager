import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { ArrowLeftRight, BadgeEuro, Building2, ChartNoAxesCombined, CircleAlert, CircleCheckBig, CreditCard, Landmark, LayoutDashboard, Loader2, LogOut, PanelLeft, Settings2, WalletCards } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const menuItems = [
  { icon: LayoutDashboard, label: "Visión general", path: "/" },
  { icon: WalletCards, label: "Resumen mensual", path: "/mensual" },
  { icon: CircleCheckBig, label: "Liquidar mes", path: "/liquidacion" },
  { icon: CreditCard, label: "Ingresos y gastos", path: "/movimientos" },
  { icon: ArrowLeftRight, label: "Movimientos corrientes", path: "/corrientes" },
  { icon: Landmark, label: "Préstamos", path: "/prestamos" },
  { icon: Building2, label: "Cuentas y deudas", path: "/cuentas" },
  { icon: ChartNoAxesCombined, label: "Informes", path: "/informes" },
  { icon: Settings2, label: "Configuración", path: "/configuracion" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { loading, user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleLocalLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);

    try {
      const response = await fetch("/auth/local/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setLoginError(typeof payload.error === "string" ? payload.error : "No se pudo iniciar sesión.");
        return;
      }
      window.location.assign("/");
    } catch {
      setLoginError("No se pudo conectar con el servidor. Inténtalo de nuevo.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen px-5 soft-grid">
        <form onSubmit={handleLocalLogin} className="flex flex-col items-center gap-8 p-8 max-w-md w-full rounded-[1.5rem] bg-card card-elevated border border-border">
          <div className="flex flex-col items-center gap-6">
            <div className="h-14 w-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/20">
              <BadgeEuro className="h-7 w-7" />
            </div>
            <h1 className="font-display text-3xl font-semibold tracking-tight text-center">
              Finanzas personales
            </h1>
            <p className="text-sm text-muted-foreground text-center max-w-sm leading-6">
              Accede a tu espacio financiero privado para consultar y actualizar tu situación mensual.
            </p>
          </div>
          <div className="w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="local-username">Usuario</Label>
              <Input id="local-username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required disabled={isLoggingIn} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="local-password">Contraseña</Label>
              <Input id="local-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={isLoggingIn} />
            </div>
            {loginError ? <p role="alert" className="flex gap-2 items-start rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive"><CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />{loginError}</p> : null}
            <Button type="submit" size="lg" className="w-full shadow-lg hover:shadow-xl transition-all" disabled={isLoggingIn}>
              {isLoggingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Entrando</> : "Entrar"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <DashboardLayoutContent>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
};

function DashboardLayoutContent({
  children,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location]);

  return (
    <>
      <div className="relative">
        <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
          <SidebarHeader className="h-24 justify-center">
            <div className="flex items-center gap-3 px-3 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-9 w-9 flex items-center justify-center hover:bg-sidebar-accent rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground">
                    <BadgeEuro className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-display text-base font-semibold tracking-tight truncate block">Lumen</span>
                    <span className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/60 block mt-0.5">Finanzas</span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-3 py-3 gap-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 rounded-xl transition-all font-medium text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground`}
                    >
                      <item.icon
                        className="h-4 w-4"
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-sidebar-accent transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-medium bg-sidebar-primary text-sidebar-primary-foreground">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-sidebar-foreground/60 truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-16 items-center justify-between bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-xl bg-card border border-border" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground font-medium">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto w-full">{children}</main>
      </SidebarInset>
    </>
  );
}

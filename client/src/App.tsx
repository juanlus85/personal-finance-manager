import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router as WouterRouter, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import AccountsPage from "./pages/Accounts";
import CurrentMovementsPage from "./pages/CurrentMovements";
import Home from "./pages/Home";
import LoansPage from "./pages/Loans";
import MonthlyPage from "./pages/Monthly";
import MovementsPage from "./pages/Movements";
import ReportsPage from "./pages/Reports";
import SettlementPage from "./pages/Settlement";
import SettingsPage from "./pages/Settings";

function AppRoutes() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/mensual"} component={MonthlyPage} />
      <Route path={"/resumen"} component={MonthlyPage} />
      <Route path={"/liquidacion"} component={SettlementPage} />
      <Route path={"/movimientos"} component={MovementsPage} />
      <Route path={"/corrientes"} component={CurrentMovementsPage} />
      <Route path={"/prestamos"} component={LoansPage} />
      <Route path={"/cuentas"} component={AccountsPage} />
      <Route path={"/informes"} component={ReportsPage} />
      <Route path={"/configuracion"} component={SettingsPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <WouterRouter hook={useHashLocation}>
            <AppRoutes />
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

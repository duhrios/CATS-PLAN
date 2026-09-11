import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { AppShell } from '@/components/app-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { CartsPage, HistoryPage, OverviewPage, ReservationsPage, WifiPage } from '@/pages/operations';
import { RoomsPage } from '@/pages/rooms';
import { UserOverviewPage } from '@/pages/user';
import { TeacherLoginPage, TeacherProfilePage } from '@/pages/profile';
import { RoomDirectoryProvider } from '@/lib/room-directory';
import { CampusDataProvider } from '@/lib/campus-data';
import { OperatorLoginPage, OperatorPage } from '@/pages/operator';
import { AccessPage, AdminLoginPage } from '@/pages/access';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const userMode = location === "/usuario" || location.startsWith("/usuario/");
  const storedRole = typeof window !== "undefined"
    ? window.localStorage.getItem("controle-carrinhos-role")
    : null;
  const operatorMode =
    location === "/operador" ||
    location.startsWith("/operador/") ||
    (storedRole === "operator" && ["/reservas", "/carrinhos", "/wifi"].includes(location));
  const adminOnlyRoute = ["/admin", "/salas", "/professores", "/historico"].some(
    (path) => location === path || location.startsWith(`${path}/`),
  );
  const restrictedRole = adminOnlyRoute && storedRole === "operator"
    ? "operator"
    : adminOnlyRoute && storedRole === "user"
      ? "user"
      : null;
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      {location === "/" || location === "/admin/login" ? (
        location === "/" ? <AccessPage /> : <AdminLoginPage />
      ) : restrictedRole ? (
        <RoleRedirect role={restrictedRole} />
      ) : <AppShell role={operatorMode ? "operator" : userMode ? "user" : "admin"}>
        <Switch>
          <Route path="/admin" component={OverviewPage} />
          <Route path="/admin/login" component={AdminLoginPage} />
          <Route path="/reservas">
            <ReservationsPage mode={operatorMode ? "operator" : "admin"} />
          </Route>
          <Route path="/carrinhos">
            <CartsPage readOnly={operatorMode} />
          </Route>
          <Route path="/salas" component={RoomsPage} />
          <Route path="/professores"><TeacherProfilePage admin /></Route>
          <Route path="/login" component={TeacherLoginPage} />
          <Route path="/operador/login" component={OperatorLoginPage} />
          <Route path="/operador" component={OperatorPage} />
          <Route path="/wifi">
            <WifiPage readOnly={operatorMode} />
          </Route>
          <Route path="/historico" component={HistoryPage} />
          <Route path="/usuario" component={UserOverviewPage} />
          <Route path="/usuario/reservas">
            <ReservationsPage mode="user" />
          </Route>
          <Route path="/usuario/perfil"><TeacherProfilePage /></Route>
          <Route component={NotFound} />
        </Switch>
      </AppShell>}
    </RoutedErrorBoundary>
  );
}

function RoleRedirect({ role }: { role: "operator" | "user" }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(role === "operator" ? "/operador" : "/usuario");
  }, [role, setLocation]);
  return null;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CampusDataProvider>
          <RoomDirectoryProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
              <Router />
            </WouterRouter>
          </RoomDirectoryProvider>
        </CampusDataProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

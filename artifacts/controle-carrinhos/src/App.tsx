import { type ReactNode, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "@/components/error-boundary";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import {
  CartsPage,
  HistoryPage,
  OverviewPage,
  ReservationsPage,
  WifiPage,
} from "@/pages/operations";
import { RoomsPage } from "@/pages/rooms";
import { UserOverviewPage } from "@/pages/user";
import { TeacherLoginPage, TeacherProfilePage } from "@/pages/profile";
import { RoomDirectoryProvider } from "@/lib/room-directory";
import { CampusDataProvider } from "@/lib/campus-data";
import { OperatorLoginPage, OperatorPage } from "@/pages/operator";
import { OperatorSettingsPage } from "@/pages/operator-settings";
import { SpreadsheetViewPage } from "@/pages/spreadsheet-view";
import {
  AccessPage,
  AdminInitialPasswordPage,
  AdminLoginPage,
} from "@/pages/access";
import {
  ConfigurationPage,
  ScheduleManagementPage,
} from "@/pages/configuration";
import { ReservationNotifications } from "@/components/reservation-notifications";
import { PushNotifications } from "@/components/push-notifications";
import { PwaInstall } from "@/components/pwa-install";
import { OperatorNotifications } from "@/components/operator-notifications";
import {
  getAuthenticatedRole,
  getAuthenticatedSession,
  onAuthenticatedSessionChange,
  refreshAuthenticatedSession,
} from "@/lib/auth-session";
import { Route, Switch, useLocation, Router as WouterRouter } from "wouter";

const queryClient = new QueryClient();

function Router() {
  const [location] = useLocation();
  const [, setLocation] = useLocation();
  const [storedRole, setStoredRole] = useState(getAuthenticatedRole);
  const [sessionChecking, setSessionChecking] = useState(true);
  const userMode = location === "/usuario" || location.startsWith("/usuario/");
  const isSuperAdmin = getAuthenticatedSession()?.isSuperAdmin === true;
  const mustChangePassword =
    getAuthenticatedSession()?.mustChangePassword === true;
  const operatorMode =
    location === "/operador" ||
    location.startsWith("/operador/") ||
    (storedRole === "operator" && location === "/salas") ||
    (storedRole === "operator" && location === "/visao-planilha") ||
    (storedRole === "operator" &&
      ["/reservas", "/carrinhos", "/wifi"].includes(location));
  const publicRoute = [
    "/",
    "/login",
    "/operador/login",
    "/admin/login",
  ].includes(location);
  const adminOnlyRoute = [
    "/admin",
    "/professores",
    "/historico",
    "/carrinhos",
    "/configuracao",
    "/visao-planilha",
  ].some((path) => location === path || location.startsWith(`${path}/`));
  const userOnlyRoute =
    location === "/usuario" || location.startsWith("/usuario/");
  const teacherSpreadsheetRoute = location === "/visao-planilha";
  const operatorOnlyRoute =
    location === "/operador" || location.startsWith("/operador/");
  useEffect(() => {
    if (publicRoute) {
      setStoredRole(getAuthenticatedRole());
      setSessionChecking(false);
      return onAuthenticatedSessionChange(() => {
        setStoredRole(getAuthenticatedRole());
      });
    }
    let active = true;
    const syncSession = () => {
      void refreshAuthenticatedSession()
        .then((session) => {
          if (active) setStoredRole(session?.role ?? null);
        })
        .catch(() => {
          if (active) setStoredRole(null);
        })
        .finally(() => {
          if (active) setSessionChecking(false);
        });
    };
    const handleSessionChange = () => {
      setStoredRole(getAuthenticatedRole());
      setSessionChecking(false);
    };
    syncSession();
    const interval = window.setInterval(syncSession, 30_000);
    window.addEventListener("focus", syncSession);
    const unsubscribe = onAuthenticatedSessionChange(handleSessionChange);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", syncSession);
      unsubscribe();
    };
  }, [location, publicRoute]);
  if (!publicRoute && sessionChecking) return null;
  if (!publicRoute && !storedRole) return <RoleRedirect role="access" />;
  if (mustChangePassword && location !== "/admin/alterar-senha") {
    return <RoleRedirect role="password" />;
  }
  if (
    location === "/admin/alterar-senha" &&
    !mustChangePassword &&
    !sessionChecking
  ) {
    return <RoleRedirect role={storedRole === "admin" ? "admin" : "access"} />;
  }
  const redirectRole =
    storedRole === "user" && !userOnlyRoute && !teacherSpreadsheetRoute
      ? "user"
      : storedRole === "operator" &&
          adminOnlyRoute &&
          location !== "/visao-planilha"
        ? "operator"
        : storedRole === "admin" && (userOnlyRoute || operatorOnlyRoute)
          ? "access"
          : location.startsWith("/configuracao") &&
              (!isSuperAdmin || storedRole !== "admin")
            ? storedRole === "operator"
              ? "operator"
              : "access"
            : null;
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      {location === "/" ||
      location === "/admin/login" ||
      location === "/admin/alterar-senha" ||
      location === "/login" ||
      location === "/operador/login" ? (
        location === "/" ? (
          <AccessPage />
        ) : location === "/admin/alterar-senha" ? (
          <AdminInitialPasswordPage />
        ) : location === "/admin/login" ? (
          <AdminLoginPage />
        ) : location === "/login" ? (
          <TeacherLoginPage />
        ) : (
          <OperatorLoginPage />
        )
      ) : redirectRole ? (
        <RoleRedirect role={redirectRole} />
      ) : (
        <AppShell
          role={
            operatorMode
              ? "operator"
              : userMode || (teacherSpreadsheetRoute && storedRole === "user")
                ? "user"
                : "admin"
          }
        >
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
            <Route path="/professores">
              <TeacherProfilePage admin />
            </Route>
            <Route path="/login" component={TeacherLoginPage} />
            <Route path="/operador/login" component={OperatorLoginPage} />
            <Route
              path="/operador/configuracao"
              component={OperatorSettingsPage}
            />
            <Route path="/operador" component={OperatorPage} />
            <Route path="/wifi">
              <WifiPage readOnly={operatorMode} />
            </Route>
            <Route path="/historico" component={HistoryPage} />
            <Route path="/visao-planilha">
              <SpreadsheetViewPage readOnly={storedRole === "user"} />
            </Route>
            <Route path="/configuracao" component={ConfigurationPage} />
            <Route
              path="/configuracao/horarios"
              component={ScheduleManagementPage}
            />
            <Route path="/usuario" component={UserOverviewPage} />
            <Route path="/usuario/reservas">
              <ReservationsPage mode="user" />
            </Route>
            <Route path="/usuario/perfil">
              <TeacherProfilePage />
            </Route>
            <Route component={NotFound} />
          </Switch>
        </AppShell>
      )}
    </RoutedErrorBoundary>
  );
}

function RoleRedirect({
  role,
}: {
  role: "admin" | "operator" | "password" | "user" | "access";
}) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(
      role === "admin"
        ? "/admin"
        : role === "operator"
          ? "/operador"
          : role === "password"
            ? "/admin/alterar-senha"
            : role === "user"
              ? "/usuario"
              : "/",
    );
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
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </RoomDirectoryProvider>
          <ReservationNotifications />
          <OperatorNotifications />
        </CampusDataProvider>
        <Toaster />
        <div className="fixed bottom-4 right-4 z-40">
          <div className="flex flex-col items-end gap-2">
            <PwaInstall />
            <PushNotifications />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

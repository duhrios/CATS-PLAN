import { type ReactNode } from 'react';
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
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <AppShell role={userMode ? "user" : "admin"}>
        <Switch>
          <Route path="/" component={OverviewPage} />
          <Route path="/reservas">
            <ReservationsPage />
          </Route>
          <Route path="/carrinhos" component={CartsPage} />
          <Route path="/salas" component={RoomsPage} />
          <Route path="/professores"><TeacherProfilePage admin /></Route>
          <Route path="/login" component={TeacherLoginPage} />
          <Route path="/wifi" component={WifiPage} />
          <Route path="/historico" component={HistoryPage} />
          <Route path="/usuario" component={UserOverviewPage} />
          <Route path="/usuario/reservas">
            <ReservationsPage mode="user" />
          </Route>
          <Route path="/usuario/perfil"><TeacherProfilePage /></Route>
          <Route component={NotFound} />
        </Switch>
      </AppShell>
    </RoutedErrorBoundary>
  );
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

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const { authSession, setLocation, endAuthSession, location } = vi.hoisted(() => ({
  authSession: { current: null as null | { role: "admin" | "operator" | "user"; name: string } },
  setLocation: vi.fn(),
  endAuthSession: vi.fn(),
  location: { current: "/operador" },
}));

vi.mock("wouter", () => ({
  useLocation: () => [location.current, setLocation],
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/lib/campus-data", () => ({
  useCampusData: () => ({
    teacher: { name: "Professora" },
    campusSettings: { agendaLabel: "Agenda", campusName: "Campus" },
    reservationsSyncError: "",
    operationalStateSyncError: "",
  }),
}));

vi.mock("@/lib/auth-session", () => ({
  endAuthSession,
  getAuthenticatedSession: () => authSession.current,
}));

vi.mock("@/lib/reservations-api", () => ({
  requestSharedReservationsRefresh: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/teacher-spreadsheet", () => ({
  loadTeacherSpreadsheetEnabled: vi.fn().mockResolvedValue(true),
}));

describe("app shell role navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    location.current = "/operador";
  });

  it("keeps all administration navigation available inside the TI operations view", () => {
    authSession.current = { role: "admin", name: "Eduardo" };

    render(<AppShell role="operator"><main>TI</main></AppShell>);

    expect(screen.getByRole("link", { name: /Usuários/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Histórico/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Área do TI/ })).toBeInTheDocument();
    expect(screen.getByText("Eduardo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Voltar à administração" }));
    expect(setLocation).toHaveBeenCalledWith("/admin");
  });

  it("keeps TI accounts in the TI navigation without an administration switch", () => {
    authSession.current = { role: "operator", name: "Equipe TI" };

    render(<AppShell role="operator"><main>TI</main></AppShell>);

    expect(screen.getByRole("link", { name: "Visão do dia" })).toHaveAttribute("href", "/operador");
    expect(screen.getByRole("link", { name: "Reservas" })).toHaveAttribute("href", "/reservas");
    expect(screen.getByRole("link", { name: "Pontos Wi-Fi" })).toHaveAttribute("href", "/wifi");
    expect(screen.queryByRole("link", { name: /Usuários/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-switch-role")).not.toBeInTheDocument();
  });

  it("shows support and the requested attribution in the teacher navigation", () => {
    authSession.current = { role: "user", name: "Ana Souza" };
    location.current = "/suporte";

    render(<AppShell role="user"><main>Suporte</main></AppShell>);

    expect(screen.getByRole("link", { name: "Suporte" })).toHaveAttribute("href", "/suporte");
    expect(screen.getByRole("link", { name: "Meu perfil" })).toBeInTheDocument();
    expect(screen.getByText("by: Eduardo Rios")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "eduardo123rios@gmail.com" }))
      .toHaveAttribute("href", "mailto:eduardo123rios@gmail.com");
    expect(screen.queryByRole("link", { name: "Usuários" })).not.toBeInTheDocument();
  });
});

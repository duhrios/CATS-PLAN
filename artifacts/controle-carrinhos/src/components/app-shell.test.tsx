import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const { authSession, setLocation, endAuthSession } = vi.hoisted(() => ({
  authSession: { current: null as null | { role: "admin" | "operator"; name: string } },
  setLocation: vi.fn(),
  endAuthSession: vi.fn(),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/operador", setLocation],
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

    expect(screen.getByRole("link", { name: /Visão do Dia/ })).toHaveAttribute("href", "/operador");
    expect(screen.getByRole("link", { name: "Reserva" })).toHaveAttribute("href", "/reservas");
    expect(screen.queryByRole("link", { name: /Usuários/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-switch-role")).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextBookableWeekday } from "@/lib/cart-availability";
import { UserOverviewPage } from "./user";

const { useCampusData } = vi.hoisted(() => ({
  useCampusData: vi.fn(),
}));

vi.mock("wouter", () => ({
  Link: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/campus-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/campus-data")>();
  return {
    ...actual,
    useCampusData,
  };
});

describe("teacher dashboard cart availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const date = nextBookableWeekday(new Date());
    useCampusData.mockReturnValue({
      reservations: [{
        id: 12,
        teacher: "Outra professora",
        segment: "Fundamental 1",
        subject: "",
        className: "2º ano A",
        room: "Sala 01",
        period: "Manhã",
        date,
        start: "07:00",
        end: "07:45",
        cart: "Carrinho A",
        status: "Confirmada",
        kind: "Aula",
        quantity: 1,
      }],
      teacher: { name: "Ana Souza", email: "", segment: "Fundamental 1", subject: "" },
      movements: [],
      carts: [
        { id: "cart-a", name: "Carrinho A", unavailable: false, status: "Pronto" },
        { id: "cart-b", name: "Carrinho B", unavailable: false, status: "Pronto" },
      ],
      cartSchedules: {
        "Carrinho A": {
          Manhã: [{ id: "a-1", start: "07:00", end: "07:45" }],
          Tarde: [],
        },
        "Carrinho B": {
          Manhã: [{ id: "b-1", start: "07:00", end: "07:45" }],
          Tarde: [],
        },
      },
      movementSettings: { allowCartATransitionScheduling: false },
      campusSettings: { agendaLabel: "Agenda" },
      updateMovementStatus: vi.fn(),
      reportNotReceived: vi.fn(),
      requestMovementAgain: vi.fn(),
    });
  });

  it("shows free and occupied cart times instead of Chromebook unit counts", () => {
    render(<UserOverviewPage />);

    expect(screen.getByText("Carrinhos e horários disponíveis")).toBeInTheDocument();
    expect(screen.getByTestId("slot-availability-cart-a-Manhã-a-1")).toHaveTextContent(
      "07:00–07:45 · Reservado",
    );
    expect(screen.getByTestId("slot-availability-cart-b-Manhã-b-1")).toHaveTextContent(
      "07:00–07:45 · Livre",
    );
    expect(screen.queryByText(/Chromebooks disponíveis/)).not.toBeInTheDocument();
    expect(screen.getByTestId("link-user-book-next-date")).toHaveAttribute(
      "href",
      `/usuario/reservas?nova=1&data=${nextBookableWeekday(new Date())}`,
    );
  });
});

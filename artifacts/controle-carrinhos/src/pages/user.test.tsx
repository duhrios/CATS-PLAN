import { fireEvent, render, screen } from "@testing-library/react";
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
          Tarde: [{ id: "a-tarde-1", start: "13:00", end: "13:45" }],
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
    expect(
      screen.getByRole("button", {
        name: "Minimizar Carrinhos e horários disponíveis",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("slot-availability-cart-a-Manhã-a-1")).toHaveTextContent(
      "07:00–07:45 · Reservado",
    );
    expect(screen.getByTestId("slot-availability-cart-b-Manhã-b-1")).toHaveTextContent(
      "07:00–07:45 · Livre",
    );
    expect(screen.queryByText(/Chromebooks disponíveis/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("link-user-book-next-date")).not.toBeInTheDocument();
  });

  it("lets the teacher navigate days, reset the date, and filter availability by period", () => {
    render(<UserOverviewPage />);
    expect(
      screen.getByRole("button", {
        name: "Minimizar Carrinhos e horários disponíveis",
      }),
    ).toHaveAttribute("aria-expanded", "true");

    const initialDate = nextBookableWeekday(new Date());
    const nextDayDate = new Date(`${initialDate}T12:00:00`);
    nextDayDate.setDate(nextDayDate.getDate() + 1);
    const expectedNextDay = `${nextDayDate.getFullYear()}-${String(nextDayDate.getMonth() + 1).padStart(2, "0")}-${String(nextDayDate.getDate()).padStart(2, "0")}`;

    fireEvent.click(screen.getByTestId("button-availability-next-day"));
    expect(screen.getByTestId("input-availability-date")).toHaveValue(expectedNextDay);
    expect(screen.getByRole("button", { name: /dia anterior/i })).toBeInTheDocument();

    fireEvent.change(screen.getByTestId("select-availability-period"), {
      target: { value: "Manhã" },
    });
    expect(screen.getByTestId("slot-availability-cart-a-Manhã-a-1")).toBeInTheDocument();
    expect(screen.queryByTestId("slot-availability-cart-a-Tarde-a-tarde-1")).not.toBeInTheDocument();
    expect(screen.getByText(/horários estão livres/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-availability-today"));
    expect(screen.getByTestId("input-availability-date")).toHaveValue(initialDate);

    fireEvent.change(screen.getByTestId("input-availability-date"), {
      target: { value: "2026-11-12" },
    });
    expect(screen.getByTestId("input-availability-date")).toHaveValue("2026-11-12");
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoomsPage } from "./rooms";

const { useRoomDirectory } = vi.hoisted(() => ({
  useRoomDirectory: vi.fn(),
}));

vi.mock("@/lib/room-directory", () => ({
  segmentAbbreviation: (segment: string) => segment.slice(0, 2),
  useRoomDirectory,
}));

describe("room directory access", () => {
  beforeEach(() => {
    useRoomDirectory.mockReturnValue({
      rooms: [{
        id: "room-14",
        number: "14",
        floor: "1º andar",
        segment: "Fundamental 2",
        morningClasses: ["7º ano A"],
        afternoonClasses: [],
      }],
      classEntries: [],
      roomCatalogLoading: false,
      roomsSyncError: "",
      syncRooms: vi.fn(),
      addRoom: vi.fn(),
      updateRoom: vi.fn(),
      deleteRoom: vi.fn(),
      deleteRooms: vi.fn(),
    });
  });

  it("allows TI to view rooms without room-management actions", () => {
    render(<RoomsPage readOnly />);

    expect(screen.getByTestId("card-room-14")).toHaveTextContent("Sala 14");
    expect(screen.getByTestId("text-room-morning-14")).toHaveTextContent("7º ano A");
    expect(screen.queryByTestId("button-new-room")).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-toggle-room-selection")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar sala 14" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Excluir sala 14" })).not.toBeInTheDocument();
  });

  it("preserves room-management controls for administrators", () => {
    render(<RoomsPage />);

    expect(screen.getByTestId("button-new-room")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-toggle-room-selection"));
    expect(screen.getByTestId("room-selection-toolbar")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar sala 14" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Excluir sala 14" })).toBeInTheDocument();
  });
});

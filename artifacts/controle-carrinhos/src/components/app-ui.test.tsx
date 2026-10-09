import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal } from "./app-ui";

describe("Modal", () => {
  it("renders centered in the document body outside animated page containers", () => {
    render(
      <div style={{ transform: "translateY(8px)" }}>
        <Modal title="Editar sala" onClose={vi.fn()}>
          <p>Dados da sala</p>
        </Modal>
      </div>,
    );

    const modal = screen.getByTestId("modal");
    expect(modal.parentElement).toBe(document.body);
    expect(modal.className).toContain("items-center");
    expect(modal.className).toContain("justify-center");
  });
});
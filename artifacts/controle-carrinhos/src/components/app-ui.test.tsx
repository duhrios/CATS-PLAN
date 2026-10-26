import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Modal, SectionCard } from "./app-ui";

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

  describe("SectionCard", () => {
    it("starts minimized and can maximize its content without hiding header actions", () => {
      render(
        <SectionCard
          title="Contas de acesso"
          action={<button type="button">Importar e-mails</button>}
        >
          <p>Lista de usuários</p>
        </SectionCard>,
      );

      const toggle = screen.getByRole("button", { name: "Maximizar Contas de acesso" });
      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(screen.getByText("Lista de usuários").parentElement).toHaveAttribute("hidden");
      expect(screen.getByRole("button", { name: "Importar e-mails" })).toBeVisible();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(toggle).toHaveAccessibleName("Minimizar Contas de acesso");
      expect(screen.getByText("Lista de usuários").parentElement).not.toHaveAttribute("hidden");
      expect(screen.getByRole("button", { name: "Importar e-mails" })).toBeVisible();

      fireEvent.click(toggle);

      expect(toggle).toHaveAttribute("aria-expanded", "false");
      expect(toggle).toHaveAccessibleName("Maximizar Contas de acesso");
      expect(screen.getByText("Lista de usuários").parentElement).toHaveAttribute("hidden");
    });
  });
});
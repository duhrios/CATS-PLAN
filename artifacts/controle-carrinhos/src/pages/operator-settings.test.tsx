import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorSettingsPage } from "./operator-settings";

const { playOperatorAlert, readOperatorSettings } = vi.hoisted(() => ({
  playOperatorAlert: vi.fn(),
  readOperatorSettings: vi.fn(),
}));

vi.mock("@/pages/operator", () => ({
  playOperatorAlert,
  readOperatorSettings,
}));

vi.mock("@/lib/operator-audio", () => ({
  subscribeToOperatorAudioErrors: vi.fn(() => () => {}),
}));

const baseSettings = {
  volume: 70,
  vibration: true,
  tone: "classic" as const,
  notificationMode: "selection" as const,
  customToneName: "",
  customToneUrl: "",
  alarmDurationSeconds: 5,
};

describe("operator custom tone settings", () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    window.localStorage.clear();
    vi.clearAllMocks();
    readOperatorSettings.mockReturnValue(baseSettings);
  });

  it("uses a styled file picker and saves a selected audio file", async () => {
    render(<OperatorSettingsPage />);

    const fileInput = screen.getByTestId("input-custom-tone-file");
    const openFilePicker = vi.spyOn(fileInput, "click");
    expect(screen.getByTestId("button-select-custom-tone")).toHaveTextContent(
      "Escolher arquivo",
    );
    expect(fileInput).toHaveClass("sr-only");
    fireEvent.click(screen.getByTestId("button-select-custom-tone"));
    expect(openFilePicker).toHaveBeenCalledOnce();

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["audio"], "aviso.wav", { type: "audio/wav" })],
      },
    });

    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem("controle-carrinhos-operator-settings") ??
          "{}",
      );
      expect(saved.customToneName).toBe("aviso.wav");
      expect(saved.customToneUrl).toMatch(/^data:audio\/wav;base64,/);
    });

    expect(screen.getByTestId("button-select-custom-tone")).toHaveTextContent(
      "Trocar arquivo",
    );
    expect(screen.getAllByText("aviso.wav")).toHaveLength(2);
    expect(screen.getByTestId("button-remove-custom-tone")).toBeInTheDocument();
  });

  it("removes the selected file and returns to a built-in tone", () => {
    readOperatorSettings.mockReturnValue({
      ...baseSettings,
      tone: "custom",
      customToneName: "aviso.wav",
      customToneUrl: "data:audio/wav;base64,YXVkaW8=",
    });
    render(<OperatorSettingsPage />);

    fireEvent.click(screen.getByTestId("button-remove-custom-tone"));

    const saved = JSON.parse(
      window.localStorage.getItem("controle-carrinhos-operator-settings") ??
        "{}",
    );
    expect(saved).toMatchObject({
      tone: "classic",
      customToneName: "",
      customToneUrl: "",
    });
    expect(screen.queryByText("aviso.wav")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("button-remove-custom-tone"),
    ).not.toBeInTheDocument();
  });

  it("shows a clear error for a non-audio file", () => {
    render(<OperatorSettingsPage />);

    fireEvent.change(screen.getByTestId("input-custom-tone-file"), {
      target: {
        files: [
          new File(["not audio"], "document.pdf", { type: "application/pdf" }),
        ],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Selecione um arquivo de áudio válido.",
    );
  });

  it("explains the audio file size limit", () => {
    render(<OperatorSettingsPage />);

    fireEvent.change(screen.getByTestId("input-custom-tone-file"), {
      target: {
        files: [
          new File(["x".repeat(2_000_001)], "grande.wav", {
            type: "audio/wav",
          }),
        ],
      },
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "O arquivo excede o limite de 2 MB.",
    );
  });

  it("shows movement reminder settings when embedded in administrator settings", () => {
    render(<OperatorSettingsPage embedded />);

    expect(screen.getByText("Lembretes de movimentação")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /testar aviso/i })).toBeInTheDocument();
  });
});

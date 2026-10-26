import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NotificationSettingsProvider,
} from "@/lib/notification-settings";
import { AdminNotifications } from "./admin-notifications";

vi.mock("@/lib/auth-session", () => ({
  getAuthenticatedRole: () => "admin",
  onAuthenticatedSessionChange: () => () => undefined,
}));

const renderSettings = () =>
  render(
    <NotificationSettingsProvider>
      <AdminNotifications />
    </NotificationSettingsProvider>,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Admin notification settings", () => {
  it("loads notification-specific switches and persists only the selected notification", async () => {
    let settings = {
      ti: {
        "reservation-created": true,
        "reservation-scheduled": true,
        "movement-request": true,
        "movement-audio": true,
        push: true,
      },
      teachers: { push: true },
    };
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as {
          group: "ti" | "teachers";
          notification: string;
          enabled: boolean;
        };
        settings = {
          ...settings,
          [body.group]: {
            ...settings[body.group],
            [body.notification]: body.enabled,
          },
        };
      }
      return new Response(JSON.stringify(settings), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Maximizar TI" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximizar Professores" }));

    const createdSwitch = await screen.findByRole("switch", {
      name: "Notificação Nova reserva criada para TI",
    });
    const scheduledSwitch = screen.getByRole("switch", {
      name: "Notificação Reserva no horário agendado para TI",
    });
    const teacherSwitch = screen.getByRole("switch", {
      name: "Notificação Inscrição para receber notificações push para Professores",
    });
    expect(createdSwitch).toHaveAttribute("aria-checked", "true");
    expect(scheduledSwitch).toHaveAttribute("aria-checked", "true");
    expect(teacherSwitch).toHaveAttribute("aria-checked", "true");

    fireEvent.click(createdSwitch);

    await waitFor(() => expect(createdSwitch).toHaveAttribute("aria-checked", "false"));
    expect(scheduledSwitch).toHaveAttribute("aria-checked", "true");
    expect(teacherSwitch).toHaveAttribute("aria-checked", "true");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notifications/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          group: "ti",
          notification: "reservation-created",
          enabled: false,
        }),
      }),
    );
  });

  it("keeps the saved state and shows an error when a toggle cannot be saved", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "PUT"
        ? new Response(JSON.stringify({ error: "Falha de gravação." }), { status: 500 })
        : new Response(JSON.stringify({
            ti: {
              "reservation-created": true,
              "reservation-scheduled": true,
              "movement-request": true,
              "movement-audio": true,
              push: true,
            },
            teachers: { push: true },
          }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderSettings();
    fireEvent.click(screen.getByRole("button", { name: "Maximizar TI" }));
    const tiSwitch = await screen.findByRole("switch", {
      name: "Notificação Nova reserva criada para TI",
    });
    fireEvent.click(tiSwitch);

    expect(await screen.findByRole("alert")).toHaveTextContent("Falha de gravação.");
    expect(tiSwitch).toHaveAttribute("aria-checked", "true");
  });
});

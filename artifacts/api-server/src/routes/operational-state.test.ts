import { describe, expect, it, vi } from "vitest";
import {
  nextOperationalStateTimestamp,
  operationalStateForRole,
  operatorOperationalStateUpdateAllowed,
  preserveDeletedOperationalEntities,
  preserveDeletedCartUnits,
  publicOperationalState,
  validateOperationalState,
} from "./operational-state";
import {
  activityMetadata,
  buildDeletedReservationMovementEvents,
  buildOperationalActivityEvents,
} from "../lib/activity-history";

vi.mock("@workspace/db", () => ({ db: {} }));

describe("operational state validation", () => {
  it("accepts supported operational datasets", () => {
    expect(validateOperationalState({
      "controle-carrinhos-carts": [{ id: "cart-a" }],
      "controle-carrinhos-movements": [],
      "controle-carrinhos-campus-settings": { campusName: "Campus" },
    })).toEqual({
      "controle-carrinhos-carts": [{ id: "cart-a" }],
      "controle-carrinhos-movements": [],
      "controle-carrinhos-campus-settings": { campusName: "Campus" },
    });
  });

  describe("operational activity history", () => {
    it("keeps reserve returns, equipment changes, and Wi-Fi changes as separate events", () => {
      const previousState = {
        "controle-carrinhos-carts": [{
          id: "cart-b",
          name: "Carrinho B",
          unavailable: false,
          unavailableUnits: [],
          reservedUnits: [],
          reserveAssignments: {
            B48: {
              teacher: "Kaique Moura",
              date: "2026-11-18",
              start: "10:25",
              personType: "Professor",
            },
          },
        }],
        "controle-carrinhos-wifi-points": [{
          id: "wifi-1",
          name: "Bloco 1",
          point: "AP-01",
          status: "Em uso",
          assignedRoom: "Sala 12",
        }],
        "controle-carrinhos-wifi-rooms": [{ room: "Sala 12", hasWifi: true }],
      };
      const nextState = {
        "controle-carrinhos-carts": [{
          id: "cart-b",
          name: "Carrinho B",
          unavailable: true,
          unavailableUnits: ["B49"],
          reservedUnits: [],
          reserveAssignments: {},
        }],
        "controle-carrinhos-wifi-points": [{
          id: "wifi-1",
          name: "Bloco 1",
          point: "AP-01",
          status: "Em manutenção",
          assignedRoom: "Sala 12",
        }],
        "controle-carrinhos-wifi-rooms": [{ room: "Sala 12", hasWifi: false }],
      };

      const events = buildOperationalActivityEvents(
        previousState,
        nextState,
        "Equipe TI",
        "admin",
      );

      expect(events).toEqual(expect.arrayContaining([
        expect.objectContaining({
          type: "Reserva",
          title: "Chromebook de reserva devolvido",
          person: "Kaique Moura",
          entityKeys: ["reserve-assignment:cart-b:B48"],
        }),
        expect.objectContaining({
          type: "Equipamento",
          detail: expect.stringContaining("B49"),
        }),
        expect.objectContaining({
          type: "Wi-Fi",
          detail: expect.stringContaining("Em manutenção"),
        }),
        expect.objectContaining({
          type: "Wi-Fi",
          title: "Conectividade da sala alterada",
          detail: "Sala 12 · Wi-Fi indisponível",
        }),
      ]));
    });

    it("preserves movement details when its reservation is deleted", () => {
      const events = buildDeletedReservationMovementEvents({
        id: 17,
        teacherName: "Ana Souza",
        cartName: "Carrinho A",
        room: "Sala 12",
      }, [{
        reservationId: 17,
        movedAt: "2026-11-18T13:30:00.000Z",
        movedBy: "Equipe TI",
        completedAt: "2026-11-18T13:45:00.000Z",
        completedBy: "Equipe TI",
      }], "Administradora");

      expect(events).toHaveLength(2);
      expect(events[0]).toMatchObject({
        type: "Movimentação",
        title: "Carrinho em movimentação",
        detail: "Carrinho A · Sala 12 · Movido por: Equipe TI",
        entityKeys: ["movement:17:moved"],
        occurredAt: "2026-11-18T13:30:00.000Z",
      });
      expect(events[1]).toMatchObject({
        title: "Movimentação concluída",
        entityKeys: ["movement:17:completed"],
      });
    });

    it("reads legacy plain-text activity descriptions", () => {
      expect(activityMetadata("Descrição antiga")).toEqual({
        detail: "Descrição antiga",
      });
    });
  });

  it("rejects unknown keys, primitive values, and oversized payloads", () => {
    expect(validateOperationalState({
      "controle-carrinhos-admin-accounts": [{ name: "Admin" }],
    })).toBeNull();
    expect(validateOperationalState({
      "controle-carrinhos-carts": "not-an-object",
    })).toBeNull();
    expect(validateOperationalState({
      "controle-carrinhos-carts": [{ details: "x".repeat(513_000) }],
    })).toBeNull();
    expect(validateOperationalState(null)).toBeNull();
    expect(validateOperationalState({ __deletedWifiPointIds: ["wifi-1"] })).toBeNull();
    expect(validateOperationalState(
      { __deletedWifiPointIds: ["wifi-1"] },
      true,
    )).not.toBeNull();
  });

  it("does not expose staff movements or Wi-Fi data to teacher sessions", () => {
    const state = {
      "controle-carrinhos-carts": [],
      "controle-carrinhos-cart-schedules": {},
      "controle-carrinhos-movements": [{ reservationId: 22 }],
      "controle-carrinhos-wifi-points": [{ name: "Internal AP" }],
      "controle-carrinhos-campus-settings": {},
    };

    expect(operationalStateForRole(state, "user")).toEqual({
      "controle-carrinhos-carts": [],
      "controle-carrinhos-cart-schedules": {},
      "controle-carrinhos-campus-settings": {},
    });
    expect(operationalStateForRole(state, "admin")).toEqual(state);
  });

  it("limits TI state changes to movements and mobile antenna assignments", () => {
    const previousState = {
      "controle-carrinhos-carts": [{ id: "cart-a", name: "Carrinho A" }],
      "controle-carrinhos-cart-schedules": { "Carrinho A": {} },
      "controle-carrinhos-wifi-points": [
        {
          id: "mobile-1",
          name: "Antena volante",
          type: "Antena volante",
          status: "Disponível",
        },
        {
          id: "fixed-1",
          name: "Ponto fixo",
          type: "Ponto fixo",
          status: "Disponível",
        },
      ],
      "controle-carrinhos-wifi-rooms": [{ room: "Sala 12", hasWifi: false }],
      "controle-carrinhos-movements": [
        { reservationId: 17, status: "Não movido" },
      ],
      "controle-carrinhos-movement-settings": { autoComplete: false },
      "controle-carrinhos-campus-settings": { campusName: "Campus" },
    };
    const nextState = {
      ...previousState,
      "controle-carrinhos-wifi-points": [
        {
          ...previousState["controle-carrinhos-wifi-points"][0],
          assignedRoom: "Sala 12",
          status: "Em uso",
        },
        previousState["controle-carrinhos-wifi-points"][1],
      ],
      "controle-carrinhos-movements": [
        { reservationId: 17, status: "Movendo" },
      ],
    };

    expect(operatorOperationalStateUpdateAllowed(previousState, nextState)).toBe(true);
    expect(operatorOperationalStateUpdateAllowed(previousState, {
      ...nextState,
      "controle-carrinhos-carts": [],
    })).toBe(false);
    expect(operatorOperationalStateUpdateAllowed(previousState, {
      ...nextState,
      "controle-carrinhos-wifi-points": [
        nextState["controle-carrinhos-wifi-points"][0],
      ],
    })).toBe(false);
    expect(operatorOperationalStateUpdateAllowed(previousState, {
      ...nextState,
      "controle-carrinhos-movement-settings": { autoComplete: true },
    })).toBe(false);
    expect(operatorOperationalStateUpdateAllowed(previousState, {
      ...nextState,
      "controle-carrinhos-movements": [],
    })).toBe(false);
  });

  it("does not let a stale state restore deleted Chromebook units", () => {
    const previousState = {
      "controle-carrinhos-carts": [{
        id: "cart-c",
        name: "Carrinho C",
        code: "C",
        prefix: "C",
        total: 56,
        available: 55,
        deletedUnits: ["C56"],
        unavailableUnits: [],
        reservedUnits: ["C56"],
        reserveAssignments: {
          C56: { teacher: "Ana Souza", date: "2026-11-23" },
        },
        unavailableUnitReasons: { C56: "Tela quebrada" },
      }],
    };
    const staleState = {
      "controle-carrinhos-carts": [{
        id: "cart-c",
        name: "Carrinho C",
        code: "C",
        prefix: "C",
        total: 56,
        available: 56,
        deletedUnits: [],
        unavailableUnits: [],
        reservedUnits: ["C56"],
        reserveAssignments: {
          C56: { teacher: "Ana Souza", date: "2026-11-23" },
        },
        unavailableUnitReasons: { C56: "Tela quebrada" },
      }],
    };

    expect(preserveDeletedCartUnits(previousState, staleState)).toEqual({
      "controle-carrinhos-carts": [{
        id: "cart-c",
        name: "Carrinho C",
        code: "C",
        prefix: "C",
        total: 56,
        available: 55,
        deletedUnits: ["C56"],
        unavailableUnits: [],
        reservedUnits: [],
        reserveAssignments: {},
        unavailableUnitReasons: {},
      }],
    });
  });

  it("does not let stale operational snapshots restore deleted Wi-Fi points or carts", () => {
    const activeState = {
      "controle-carrinhos-carts": [{ id: "cart-a", name: "Carrinho A" }],
      "controle-carrinhos-wifi-points": [{ id: "wifi-mobile-1", name: "Antena volante" }],
    };
    const deletedState = preserveDeletedOperationalEntities(activeState, {
      "controle-carrinhos-carts": [],
      "controle-carrinhos-wifi-points": [],
    });
    const staleWrite = preserveDeletedOperationalEntities(deletedState, activeState);

    expect(staleWrite["controle-carrinhos-carts"]).toEqual([]);
    expect(staleWrite["controle-carrinhos-wifi-points"]).toEqual([]);
    expect(publicOperationalState(staleWrite)).toEqual({
      "controle-carrinhos-carts": [],
      "controle-carrinhos-wifi-points": [],
    });
  });

  it("allows factory restoration of deleted carts without restoring deleted Wi-Fi points", () => {
    const activeState = {
      "controle-carrinhos-carts": [{ id: "cart-a", name: "Carrinho A" }],
      "controle-carrinhos-wifi-points": [{ id: "wifi-mobile-1", name: "Antena volante" }],
    };
    const deletedState = preserveDeletedOperationalEntities(activeState, {
      "controle-carrinhos-carts": [],
      "controle-carrinhos-wifi-points": [],
    });
    const factoryState = preserveDeletedOperationalEntities(
      deletedState,
      activeState,
      true,
    );

    expect(factoryState["controle-carrinhos-carts"]).toEqual(activeState["controle-carrinhos-carts"]);
    expect(factoryState["controle-carrinhos-wifi-points"]).toEqual([]);
  });

  it("advances operational-state versions even when writes occur in the same millisecond", () => {
    const now = new Date("2026-11-18T13:30:00.000Z");
    const next = nextOperationalStateTimestamp(now, now.getTime());

    expect(next.getTime()).toBe(now.getTime() + 1);
  });
});

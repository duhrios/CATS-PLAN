import { describe, expect, it, vi } from "vitest";
import {
  operationalStateForRole,
  validateOperationalState,
} from "./operational-state";

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
});

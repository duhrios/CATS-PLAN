import { describe, expect, it } from "vitest";
import { availableReserveUnitsFromState } from "./reserve-inventory";

describe("available reserve units", () => {
  it("excludes unavailable and assigned units while retaining unassigned units", () => {
    expect(availableReserveUnitsFromState({
      "controle-carrinhos-carts": [
        {
          unavailable: false,
          reservedUnits: ["B49", "B50", "B51", "B52"],
          unavailableUnits: ["B51"],
          deletedUnits: ["B52"],
          reserveAssignments: {
            B50: { teacher: "Ana Souza", date: "2026-10-12" },
          },
        },
        {
          unavailable: true,
          reservedUnits: ["C49"],
        },
        {
          unavailable: false,
          reservedUnits: ["B49", "C50"],
        },
      ],
    })).toEqual(["B49", "C50"]);
  });

  it("returns no stock for an absent or malformed operational state", () => {
    expect(availableReserveUnitsFromState(null)).toEqual([]);
    expect(availableReserveUnitsFromState({ "controle-carrinhos-carts": "invalid" }))
      .toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import { getRoutePathname, isOperatorModeForLocation } from "./route-access";

describe("operator route context", () => {
  it("keeps TI context on reservation links with filters", () => {
    expect(isOperatorModeForLocation("/reservas?hoje=1", "operator")).toBe(true);
    expect(isOperatorModeForLocation("/reservas?conflitos=1", "operator")).toBe(true);
    expect(isOperatorModeForLocation("/reservas", "operator")).toBe(true);
  });

  it("does not turn an administrator session into the TI profile", () => {
    expect(isOperatorModeForLocation("/reservas?hoje=1", "admin")).toBe(false);
    expect(isOperatorModeForLocation("/operador", "admin")).toBe(true);
  });

  it("removes query and hash before evaluating route access", () => {
    expect(getRoutePathname("/reservas?hoje=1#agenda")).toBe("/reservas");
  });
});

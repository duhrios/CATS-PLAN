export const availableReserveUnitsFromState = (value: unknown): string[] => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const carts = (value as Record<string, unknown>)["controle-carrinhos-carts"];
  if (!Array.isArray(carts)) return [];

  const availableUnits = new Set<string>();
  for (const entry of carts) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const cart = entry as Record<string, unknown>;
    if (cart.unavailable === true || !Array.isArray(cart.reservedUnits)) continue;
    const unavailableUnits = new Set(
      Array.isArray(cart.unavailableUnits)
        ? cart.unavailableUnits.filter((unit): unit is string => typeof unit === "string")
        : [],
    );
    const deletedUnits = new Set(
      Array.isArray(cart.deletedUnits)
        ? cart.deletedUnits.filter((unit): unit is string => typeof unit === "string")
        : [],
    );
    const assignments = cart.reserveAssignments;
    for (const unit of cart.reservedUnits) {
      if (
        typeof unit !== "string" ||
        unavailableUnits.has(unit) ||
        deletedUnits.has(unit)
      ) continue;
      const assigned = Boolean(
        assignments &&
          typeof assignments === "object" &&
          !Array.isArray(assignments) &&
          (assignments as Record<string, unknown>)[unit],
      );
      if (!assigned) availableUnits.add(unit);
    }
  }
  return [...availableUnits];
};

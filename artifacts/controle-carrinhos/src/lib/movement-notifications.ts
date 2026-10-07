import type { CartMovement } from "@/lib/campus-data";

export function isNewTeacherMovementRequest(
  previous: CartMovement | undefined,
  current: CartMovement,
): boolean {
  return Boolean(
    previous &&
    current.requestCount > previous.requestCount &&
    current.status === "Não movido" &&
    current.notReceived,
  );
}

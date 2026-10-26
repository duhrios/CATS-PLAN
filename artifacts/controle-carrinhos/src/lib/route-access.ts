import type { AuthenticatedRole } from "@/lib/auth-session";

export const getRoutePathname = (location: string) =>
  location.split(/[?#]/, 1)[0] || "/";

export const isOperatorModeForLocation = (
  location: string,
  role: AuthenticatedRole | null,
) => {
  const pathname = getRoutePathname(location);
  return (
    pathname === "/operador" ||
    pathname.startsWith("/operador/") ||
    (role === "operator" &&
      ["/salas", "/visao-planilha", "/reservas", "/carrinhos", "/wifi"].includes(pathname))
  );
};

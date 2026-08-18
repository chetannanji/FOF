import { Role } from "@prisma/client";
import { AuthRequest } from "../middleware/auth";

export const SPORT_EDITOR_ROLES: Role[] = ["admin", "sports_super_admin"];

/** Per-sport rep — view/export only, scoped to assigned sportId */
export function isSportsRepRole(role: Role): boolean {
  return role === "sports_admin";
}

/** Global sports editor — all sports, same sport write access as platform admin */
export function isSportsSuperAdminRole(role: Role): boolean {
  return role === "sports_super_admin";
}

export function assertSportEditAccess(req: AuthRequest, _sportId?: string): void {
  if (!req.user) {
    const err: any = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }
  if (req.user.role === "admin" || req.user.role === "sports_super_admin") return;

  const err: any = new Error("Forbidden");
  err.status = 403;
  throw err;
}

export function filterByAssignedSport<T extends { sports: Array<{ sportId: string }> }>(
  items: T[],
  sportId?: string | null
): T[] {
  if (!sportId) return items;
  return items.filter((item) => item.sports.some((ps) => ps.sportId === sportId));
}

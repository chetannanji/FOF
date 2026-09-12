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

type AssignedSportRef = {
  sportId: string;
  sport?: { parentId?: string | null } | null;
};

function assignedSportIds(sportId?: string | string[] | null): Set<string> | null {
  if (!sportId) return null;
  const ids = new Set(Array.isArray(sportId) ? sportId : [sportId]);
  return ids.size > 0 ? ids : null;
}

export function isSportInAssignedScope(
  sport: { id?: string; sportId?: string; parentId?: string | null } | null | undefined,
  sportId?: string | string[] | null
): boolean {
  const ids = assignedSportIds(sportId);
  if (!ids) return true;
  const id = sport?.id || sport?.sportId;
  return Boolean((id && ids.has(id)) || (sport?.parentId && ids.has(sport.parentId)));
}

/** Parent sport logins also include every subcategory registration. */
export function filterByAssignedSport<T extends { sports: Array<AssignedSportRef> }>(
  items: T[],
  sportId?: string | string[] | null
): T[] {
  const ids = assignedSportIds(sportId);
  if (!ids) return items;
  return items.filter((item) =>
    item.sports.some((ps) => ids.has(ps.sportId) || (ps.sport?.parentId && ids.has(ps.sport.parentId)))
  );
}

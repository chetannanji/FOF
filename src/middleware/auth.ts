import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { prisma } from "../index";
import { Role } from "@prisma/client";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: Role;
    communityId?: string | null;
    sportId?: string | null;
  };
}

export async function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  // Skip authentication for OPTIONS requests (preflight)
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    // Verify user still exists
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, role: true, communityId: true, sportId: true },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      communityId: user.communityId,
      sportId: user.sportId,
    };
    next();
  } catch (error: any) {
    return res.status(401).json({ error: error.message || "Invalid token" });
  }
}

export async function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  if (req.method === "OPTIONS") {
    return next();
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, username: true, role: true, communityId: true, sportId: true },
    });

    if (user) {
      req.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        communityId: user.communityId,
        sportId: user.sportId,
      };
    }
  } catch {
    // Public routes should remain usable with no or stale auth headers.
  }

  next();
}

export function requireRole(...allowedRoles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}



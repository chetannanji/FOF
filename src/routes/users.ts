import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { hashPassword } from "../utils/password";
import { Role } from "@prisma/client";
import { sendExport } from "../utils/export";

const router = Router();

const createUserSchema = z.object({
  username: z.string().min(1),
  email: z.string().email().optional(),
  password: z.string().min(1),
  role: z.enum(["admin", "community_admin", "sports_admin", "sports_super_admin", "volunteer_admin", "volunteer", "user"]),
  communityId: z.string().uuid().optional(),
  sportId: z.string().optional(),
});

// List users
router.get("/", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(users);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list users" });
  }
});

// Get user by ID
router.get("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get user" });
  }
});

// Create user
router.post("/", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = createUserSchema.parse(req.body);

    // Check if username already exists
    const existing = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existing) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        role: data.role as Role,
        communityId: data.communityId,
        sportId: data.sportId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.status(201).json(user);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to create user" });
  }
});

// Update user
router.patch("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createUserSchema.partial().parse(req.body);

    // Check if username already exists (if changing)
    if (data.username) {
      const existing = await prisma.user.findFirst({
        where: {
          username: data.username,
          NOT: { id },
        },
      });

      if (existing) {
        return res.status(409).json({ error: "Username already exists" });
      }
    }

    // Hash password if provided
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await hashPassword(data.password);
    }

    const updateData: any = { ...data };
    if (hashedPassword !== undefined) {
      updateData.password = hashedPassword;
    }

    const user = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(user);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update user" });
  }
});

// Delete user
router.delete("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.user.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete user" });
  }
});

// Export users
router.get("/export/:format", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { format } = req.params;
    if (!["csv", "excel"].includes(format)) {
      return res.status(400).json({ error: "Invalid format. Use 'csv' or 'excel'" });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Get community and sport names
    const communities = await prisma.community.findMany({ select: { id: true, name: true } });
    const sports = await prisma.sport.findMany({ select: { id: true, name: true, parentId: true } });

    const exportData = users.map((user) => {
      const community = communities.find((c) => c.id === user.communityId);
      const sport = sports.find((s) => s.id === user.sportId);
      let sportName = "-";
      if (sport) {
        if (sport.parentId) {
          const parent = sports.find((s) => s.id === sport.parentId);
          sportName = parent ? `${parent.name} - ${sport.name}` : sport.name;
        } else {
          sportName = sport.name;
        }
      }
      return {
        id: user.id,
        username: user.username,
        email: user.email || "",
        role: user.role,
        community: community?.name || "-",
        sport: sportName,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
      };
    });

    const headers = ["id", "username", "email", "role", "community", "sport", "createdAt", "updatedAt"];
    sendExport(res, exportData, headers, { filename: "users", format: format as "csv" | "excel" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export users" });
  }
});

export default router;




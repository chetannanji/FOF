import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { hashPassword } from "../utils/password";
import { sendExport } from "../utils/export";
import { Role } from "@prisma/client";

const router = Router();

const usernameFormatSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only include letters, numbers, underscores, hyphens or dots");

function blankToNull(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseOptionalEmail(value: unknown, field: string): string | null | undefined {
  const normalized = blankToNull(value);
  if (normalized == null) return normalized;
  const result = z.string().email().safeParse(normalized);
  if (!result.success) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: [field],
        message: "Invalid email address",
      },
    ]);
  }
  return result.data;
}

function parseOptionalUsername(value: unknown): string | null | undefined {
  const normalized = blankToNull(value);
  if (normalized == null) return normalized;
  const result = usernameFormatSchema.safeParse(normalized);
  if (!result.success) {
    throw new z.ZodError(
      result.error.issues.map((issue) => ({ ...issue, path: ["adminUsername"] }))
    );
  }
  return result.data;
}

function zodErrorPayload(error: z.ZodError) {
  const first = error.errors?.[0];
  const field = Array.isArray(first?.path) ? first.path.join(".") : "";
  const message = first?.message
    ? `${field ? `${field}: ` : ""}${first.message}`
    : "Invalid input";
  return { error: message, details: error.errors };
}

const communityWriteSchema = z.object({
  name: z.string().min(1),
  active: z.boolean().optional(),
  contactPerson: z.string().min(1),
  phone: z.union([z.string(), z.null()]).optional(),
  email: z.any().optional(),
  password: z.string().optional(),
  adminUsername: z.any().optional(),
  adminEmail: z.any().optional(),
  adminPassword: z.union([z.string(), z.null()]).optional(),
});

function normalizeCommunityContactFields(data: {
  phone?: string | null;
  email?: string | null;
}) {
  const normalized: { phone?: string; email?: string | null } = {};
  if (data.phone !== undefined) {
    normalized.phone = data.phone?.trim() || "";
  }
  if (data.email !== undefined) {
    normalized.email = data.email?.trim() ? data.email.trim() : null;
  }
  return normalized;
}

async function syncCommunityAdminUser(options: {
  communityId: string;
  adminUsername?: string | null;
  adminEmail?: string | null;
  hashedPassword?: string | null;
  passwordProvided?: boolean;
}) {
  const { communityId, adminUsername, adminEmail, hashedPassword, passwordProvided } = options;

  if (!adminUsername) {
    await prisma.user.deleteMany({
      where: { communityId, role: "community_admin" },
    });
    return;
  }

  const existingWithUsername = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (existingWithUsername && existingWithUsername.communityId !== communityId) {
    throw new Error("Username already exists");
  }

  const existingAdmin = await prisma.user.findFirst({
    where: { communityId, role: "community_admin" },
  });

  if (existingAdmin) {
    const updateData: any = {
      username: adminUsername,
      email: adminEmail || undefined,
    };
    if (passwordProvided && hashedPassword) {
      updateData.password = hashedPassword;
    }
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: updateData,
    });
    return;
  }

  if (!hashedPassword) {
    throw new Error("Admin password is required when assigning a username");
  }

  await prisma.user.create({
    data: {
      username: adminUsername,
      email: adminEmail || undefined,
      password: hashedPassword,
      role: Role.community_admin,
      communityId,
    },
  });
}

// List communities (public - needed for login page)
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const communities = await prisma.community.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        contactPerson: true,
        phone: true,
        email: true,
        adminUsername: true,
        adminEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(communities);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list communities" });
  }
});

// Get community by ID
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const community = await prisma.community.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        active: true,
        contactPerson: true,
        phone: true,
        email: true,
        adminUsername: true,
        adminEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    res.json(community);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get community" });
  }
});

// Create community
router.post("/", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = {
      ...communityWriteSchema.parse(req.body),
      email: parseOptionalEmail(req.body?.email, "email") ?? null,
      adminEmail: parseOptionalEmail(req.body?.adminEmail, "adminEmail") ?? null,
      adminUsername: parseOptionalUsername(req.body?.adminUsername) ?? null,
    };
    const normalizedContact = normalizeCommunityContactFields(data);
    const phone = normalizedContact.phone ?? "";
    const email = normalizedContact.email ?? null;

    // Check if name, email, or adminEmail already exists
    const existing = await prisma.community.findFirst({
      where: {
        OR: [
          { name: data.name },
          ...(email ? [{ email }] : []),
          ...(data.adminEmail ? [{ adminEmail: data.adminEmail } as any] : []),
          ...(data.adminUsername ? [{ adminUsername: data.adminUsername }] : []),
        ],
      } as any,
    });

    if (existing) {
      return res.status(409).json({ error: "Community with this name, email, or admin email already exists" });
    }

    // Hash passwords if provided
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await hashPassword(data.password);
    }

    let hashedAdminPassword: string | undefined;
    if (data.adminPassword) {
      hashedAdminPassword = await hashPassword(data.adminPassword);
    }

    const adminUsername = data.adminUsername?.trim() ? data.adminUsername.trim() : null;
    if (adminUsername && !data.adminPassword) {
      return res.status(400).json({ error: "Admin password is required when setting an admin username" });
    }

    const community = await prisma.community.create({
      data: {
        name: data.name,
        active: data.active ?? true,
        contactPerson: data.contactPerson,
        phone,
        email,
        password: hashedPassword,
        adminUsername,
        adminEmail: data.adminEmail || null,
        adminPassword: hashedAdminPassword || null,
      },
      select: {
        id: true,
        name: true,
        active: true,
        contactPerson: true,
        phone: true,
        email: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await syncCommunityAdminUser({
      communityId: community.id,
      adminUsername,
      adminEmail: data.adminEmail || null,
      hashedPassword: hashedAdminPassword || null,
      passwordProvided: Boolean(data.adminPassword),
    });

    res.status(201).json(community);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json(zodErrorPayload(error));
    }
    if (error.message === "Username already exists") {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === "Admin password is required when assigning a username") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to create community" });
  }
});

// Update community
router.patch("/:id", authenticate, requireRole("admin", "community_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    if (req.user!.role === "community_admin") {
      if (req.user!.communityId !== id) {
        return res.status(403).json({ error: "You can only update your own community" });
      }
    }
    const data = {
      ...(
        req.user!.role === "community_admin"
          ? communityWriteSchema.pick({ contactPerson: true, phone: true, email: true })
          : communityWriteSchema
      ).partial().parse(req.body),
      ...(req.body?.email !== undefined
        ? { email: parseOptionalEmail(req.body.email, "email") ?? null }
        : {}),
      ...(req.user!.role === "admin" && req.body?.adminEmail !== undefined
        ? { adminEmail: parseOptionalEmail(req.body.adminEmail, "adminEmail") ?? null }
        : {}),
      ...(req.user!.role === "admin" && req.body?.adminUsername !== undefined
        ? { adminUsername: parseOptionalUsername(req.body.adminUsername) ?? null }
        : {}),
    };

    const normalizedContact = normalizeCommunityContactFields(data);
    const updateData: any = { ...data, ...normalizedContact };

    // Hash passwords if provided
    let hashedPassword: string | undefined;
    if (data.password) {
      hashedPassword = await hashPassword(data.password);
    }

    let hashedAdminPassword: string | undefined;
    if (data.adminPassword) {
      hashedAdminPassword = await hashPassword(data.adminPassword);
    }
    if (hashedPassword !== undefined) {
      updateData.password = hashedPassword;
    }
    if (hashedAdminPassword !== undefined) {
      updateData.adminPassword = hashedAdminPassword;
    }
    if (data.adminEmail !== undefined) {
      updateData.adminEmail = data.adminEmail || null;
    }
    if (data.adminUsername !== undefined) {
      updateData.adminUsername = data.adminUsername?.trim() && data.adminUsername.trim().length > 0 ? data.adminUsername.trim() : null;
    }

    const community = await prisma.community.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        active: true,
        contactPerson: true,
        phone: true,
        email: true,
        adminUsername: true,
        adminEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (req.user!.role === "admin") {
      await syncCommunityAdminUser({
        communityId: community.id,
        adminUsername: community.adminUsername,
        adminEmail: community.adminEmail,
        hashedPassword: hashedAdminPassword || null,
        passwordProvided: Boolean(data.adminPassword),
      });
    }

    res.json(community);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json(zodErrorPayload(error));
    }
    if (error.code === "P2002") {
      return res.status(409).json({ error: "A community with this email already exists" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Community not found" });
    }
    if (error.message === "Username already exists") {
      return res.status(409).json({ error: error.message });
    }
    if (error.message === "Admin password is required when assigning a username") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || "Failed to update community" });
  }
});

// Delete community
router.delete("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.community.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Community not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete community" });
  }
});

// Export communities
router.get("/export/:format", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { format } = req.params;
    if (!["csv", "excel"].includes(format)) {
      return res.status(400).json({ error: "Invalid format. Use 'csv' or 'excel'" });
    }

    const communities = await prisma.community.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        contactPerson: true,
        phone: true,
        email: true,
        adminUsername: true,
        adminEmail: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const exportData = communities.map((c) => ({
      id: c.id,
      name: c.name,
      active: c.active ? "Yes" : "No",
      contactPerson: c.contactPerson,
      phone: c.phone,
      email: c.email,
      adminUsername: c.adminUsername || "",
      adminEmail: c.adminEmail || "",
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    const headers = [
      "id",
      "name",
      "active",
      "contactPerson",
      "phone",
      "email",
      "adminUsername",
      "adminEmail",
      "createdAt",
      "updatedAt",
    ];
    sendExport(res, exportData, headers, { filename: "communities", format: format as "csv" | "excel" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export communities" });
  }
});

export default router;



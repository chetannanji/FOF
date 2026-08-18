import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, optionalAuthenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

const createConvenorSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")).or(z.string().length(0)),
  sportId: z.string().optional(),
});

function canIncludeInactiveSports(req: AuthRequest): boolean {
  const role = req.user?.role as string | undefined;
  return req.query.includeInactive === "true" && (role === "admin" || role === "sports_super_admin");
}

// List all convenors
router.get("/", optionalAuthenticate, async (req: AuthRequest, res: Response) => {
  try {
    const convenors = await prisma.convenor.findMany({
      where: canIncludeInactiveSports(req)
        ? undefined
        : {
            OR: [
              { sportId: null },
              { sport: { active: true } },
            ],
          },
      include: {
        sport: true,
      },
      orderBy: { name: "asc" },
    });

    res.json(convenors);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list convenors" });
  }
});

// Get convenor by ID
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const convenor = await prisma.convenor.findUnique({
      where: { id },
      include: {
        sport: true,
      },
    });

    if (!convenor) {
      return res.status(404).json({ error: "Convenor not found" });
    }

    res.json(convenor);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get convenor" });
  }
});

// Get convenor by sport ID
router.get("/sport/:sportId", async (req: AuthRequest, res: Response) => {
  try {
    const { sportId } = req.params;

    const convenor = await prisma.convenor.findUnique({
      where: { sportId },
      include: {
        sport: true,
      },
    });

    res.json(convenor);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get convenor" });
  }
});

// Create convenor
router.post("/", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = createConvenorSchema.parse(req.body);

    // If sportId is provided, verify sport exists
    if (data.sportId) {
      const sport = await prisma.sport.findUnique({
        where: { id: data.sportId },
      });

      if (!sport) {
        return res.status(404).json({ error: "Sport not found" });
      }

      // Check if sport already has a convenor
      const existingConvenor = await prisma.convenor.findUnique({
        where: { sportId: data.sportId },
      });

      if (existingConvenor) {
        return res.status(409).json({ error: "This sport already has a convenor" });
      }
    }

    const convenor = await prisma.convenor.create({
      data: {
        name: data.name,
        phone: data.phone || "",
        email: data.email || "",
        sportId: data.sportId,
      },
      include: {
        sport: true,
      },
    });

    // Update sport to link to convenor
    if (data.sportId) {
      await prisma.sport.update({
        where: { id: data.sportId },
        data: { convenorId: convenor.id },
      });
    }

    res.status(201).json(convenor);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to create convenor" });
  }
});

// Update convenor
router.patch("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createConvenorSchema.partial().parse(req.body);

    const existing = await prisma.convenor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Convenor not found" });
    }

    // If sportId is being updated, verify sport exists and handle conflicts
    if (data.sportId !== undefined) {
      if (data.sportId) {
        const sport = await prisma.sport.findUnique({
          where: { id: data.sportId },
        });

        if (!sport) {
          return res.status(404).json({ error: "Sport not found" });
        }

        // Check if another convenor already has this sport
        const existingConvenor = await prisma.convenor.findUnique({
          where: { sportId: data.sportId },
        });

        if (existingConvenor && existingConvenor.id !== id) {
          return res.status(409).json({ error: "This sport already has a convenor" });
        }
      }

      // Update sport's convenorId
      const currentConvenor = await prisma.convenor.findUnique({
        where: { id },
      });

      if (currentConvenor?.sportId) {
        await prisma.sport.update({
          where: { id: currentConvenor.sportId },
          data: { convenorId: null },
        });
      }

      if (data.sportId) {
        await prisma.sport.update({
          where: { id: data.sportId },
          data: { convenorId: id },
        });
      }
    }

    const convenor = await prisma.convenor.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone !== undefined ? (data.phone || "") : undefined,
        email: data.email !== undefined ? (data.email || "") : undefined,
        sportId: data.sportId,
      },
      include: {
        sport: true,
      },
    });

    res.json(convenor);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Convenor not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update convenor" });
  }
});

// Delete convenor
router.delete("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await prisma.convenor.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Convenor not found" });
    }

    // Remove convenorId from sport if linked
    const convenor = await prisma.convenor.findUnique({
      where: { id },
    });

    if (convenor?.sportId) {
      await prisma.sport.update({
        where: { id: convenor.sportId },
        data: { convenorId: null },
      });
    }

    await prisma.convenor.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Convenor not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete convenor" });
  }
});

export default router;


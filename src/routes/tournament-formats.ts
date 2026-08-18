import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

const createFormatSchema = z.object({
  category: z.string().min(1),
  title: z.string().min(1),
  content: z.string().min(1),
});

// List all tournament formats
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const formats = await prisma.tournamentFormat.findMany({
      orderBy: { category: "asc" },
    });

    res.json(formats);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list tournament formats" });
  }
});

// Get format by category
router.get("/category/:category", async (req: AuthRequest, res: Response) => {
  try {
    const { category } = req.params;

    const format = await prisma.tournamentFormat.findUnique({
      where: { category },
    });

    if (!format) {
      return res.status(404).json({ error: "Tournament format not found" });
    }

    res.json(format);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get tournament format" });
  }
});

// Get format by ID
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const format = await prisma.tournamentFormat.findUnique({
      where: { id },
    });

    if (!format) {
      return res.status(404).json({ error: "Tournament format not found" });
    }

    res.json(format);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get tournament format" });
  }
});

// Create tournament format
router.post("/", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = createFormatSchema.parse(req.body);

    // Check if format with this category already exists
    const existing = await prisma.tournamentFormat.findUnique({
      where: { category: data.category },
    });

    if (existing) {
      return res.status(409).json({ 
        error: "A format with this category already exists",
        message: `A tournament format with category "${data.category}" already exists. Please edit the existing format or choose a different category.`
      });
    }

    const format = await prisma.tournamentFormat.create({
      data,
    });

    res.status(201).json(format);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2002") {
      return res.status(409).json({ 
        error: "A format with this category already exists",
        message: `A tournament format with category "${req.body.category}" already exists. Please edit the existing format or choose a different category.`
      });
    }
    res.status(500).json({ error: error.message || "Failed to create tournament format" });
  }
});

// Update tournament format
router.patch("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createFormatSchema.partial().parse(req.body);

    const format = await prisma.tournamentFormat.update({
      where: { id },
      data,
    });

    res.json(format);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Tournament format not found" });
    }
    if (error.code === "P2002") {
      return res.status(409).json({ error: "A format with this category already exists" });
    }
    res.status(500).json({ error: error.message || "Failed to update tournament format" });
  }
});

// Delete tournament format
router.delete("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.tournamentFormat.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Tournament format not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete tournament format" });
  }
});

export default router;


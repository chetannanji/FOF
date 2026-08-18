import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";

const router = Router();

const createContactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(1),
  email: z.string().email(),
});

// List contacts for a community
router.get("/community/:communityId", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { communityId } = req.params;

    const contacts = await prisma.communityContact.findMany({
      where: { communityId },
      orderBy: { createdAt: "asc" },
    });

    res.json(contacts);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list contacts" });
  }
});

// Create contact for a community
router.post("/community/:communityId", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { communityId } = req.params;
    const data = createContactSchema.parse(req.body);

    // Verify community exists
    const community = await prisma.community.findUnique({
      where: { id: communityId },
    });

    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    const contact = await prisma.communityContact.create({
      data: {
        communityId,
        ...data,
      },
    });

    res.status(201).json(contact);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to create contact" });
  }
});

// Update contact
router.patch("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createContactSchema.partial().parse(req.body);

    const contact = await prisma.communityContact.update({
      where: { id },
      data,
    });

    res.json(contact);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update contact" });
  }
});

// Delete contact
router.delete("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.communityContact.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete contact" });
  }
});

export default router;


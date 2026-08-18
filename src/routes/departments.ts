import { Router, Response } from "express";
import { prisma } from "../index";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

// List departments
router.get("/", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const departments = await prisma.department.findMany({
      orderBy: { name: "asc" },
    });

    res.json(departments);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list departments" });
  }
});

export default router;




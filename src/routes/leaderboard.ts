import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { MedalType } from "@prisma/client";

const router = Router();

const createLeaderboardEntrySchema = z.object({
  communityId: z.string().min(1),
  sportId: z.string().min(1),
  score: z.number().int().min(0),
  position: z.number().int().positive().optional().nullable(),
  medalType: z.enum(["gold", "silver", "bronze", "none"]).optional(),
  notes: z.string().optional().nullable(),
});

// Get overall leaderboard (sum of all sports, ranked by total score)
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    // Get all leaderboard entries with community and sport info
    const entries = await prisma.leaderboardEntry.findMany({
      where: {
        sport: { active: true },
      },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
        sport: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        score: "desc",
      },
    });

    // Calculate total scores per community
    const communityTotals: Record<string, {
      communityId: string;
      communityName: string;
      totalScore: number;
      entries: typeof entries;
    }> = {};

    entries.forEach((entry) => {
      const communityId = entry.communityId;
      if (!communityTotals[communityId]) {
        communityTotals[communityId] = {
          communityId,
          communityName: entry.community.name,
          totalScore: 0,
          entries: [],
        };
      }
      communityTotals[communityId].totalScore += entry.score;
      communityTotals[communityId].entries.push(entry);
    });

    // Convert to array and sort by total score
    const leaderboard = Object.values(communityTotals)
      .map((item) => ({
        communityId: item.communityId,
        communityName: item.communityName,
        totalScore: item.totalScore,
        entryCount: item.entries.length,
      }))
      .sort((a, b) => b.totalScore - a.totalScore)
      .map((item, index) => ({
        ...item,
        rank: index + 1,
      }));

    res.json(leaderboard);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get leaderboard" });
  }
});

// Get leaderboard for specific sport
router.get("/sport/:sportId", async (req: AuthRequest, res: Response) => {
  try {
    const { sportId } = req.params;

    const entries = await prisma.leaderboardEntry.findMany({
      where: { sportId, sport: { active: true } },
      include: {
        community: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
        sport: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        score: "desc",
      },
    });

    const leaderboard = entries.map((entry, index) => ({
      id: entry.id,
      communityId: entry.communityId,
      communityName: entry.community.name,
      sportId: entry.sportId,
      sportName: entry.sport.name,
      score: entry.score,
      position: entry.position,
      medalType: entry.medalType,
      notes: entry.notes,
      rank: index + 1,
    }));

    res.json(leaderboard);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get sport leaderboard" });
  }
});

// Get all scores for a specific community
router.get("/community/:communityId", async (req: AuthRequest, res: Response) => {
  try {
    const { communityId } = req.params;

    const entries = await prisma.leaderboardEntry.findMany({
      where: { communityId, sport: { active: true } },
      include: {
        community: {
          select: {
            id: true,
            name: true,
          },
        },
        sport: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        score: "desc",
      },
    });

    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get community scores" });
  }
});

// Get all leaderboard entries (for admin management)
router.get("/entries", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const entries = await prisma.leaderboardEntry.findMany({
      include: {
        community: {
          select: {
            id: true,
            name: true,
            active: true,
          },
        },
        sport: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.json(entries);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get leaderboard entries" });
  }
});

// Create/update score entry (root admin only)
// If entry exists for community+sport, it updates; otherwise creates new
router.post("/", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = createLeaderboardEntrySchema.parse(req.body);

    // Verify community exists
    const community = await prisma.community.findUnique({
      where: { id: data.communityId },
    });

    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    // Verify sport exists
    const sport = await prisma.sport.findUnique({
      where: { id: data.sportId },
    });

    if (!sport) {
      return res.status(404).json({ error: "Sport not found" });
    }

    // Check if entry already exists
    const existingEntry = await prisma.leaderboardEntry.findUnique({
      where: {
        communityId_sportId: {
          communityId: data.communityId,
          sportId: data.sportId,
        },
      },
    });

    let entry;
    if (existingEntry) {
      // Update existing entry
      entry = await prisma.leaderboardEntry.update({
        where: { id: existingEntry.id },
        data: {
          score: data.score,
          position: data.position ?? null,
          medalType: (data.medalType as MedalType) || "none",
          notes: data.notes ?? null,
        },
        include: {
          community: {
            select: {
              id: true,
              name: true,
            },
          },
          sport: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    } else {
      // Create new entry
      entry = await prisma.leaderboardEntry.create({
        data: {
          communityId: data.communityId,
          sportId: data.sportId,
          score: data.score,
          position: data.position ?? null,
          medalType: (data.medalType as MedalType) || "none",
          notes: data.notes ?? null,
        },
        include: {
          community: {
            select: {
              id: true,
              name: true,
            },
          },
          sport: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });
    }

    res.status(existingEntry ? 200 : 201).json(entry);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to create/update leaderboard entry" });
  }
});

// Update score entry (root admin only)
router.patch("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createLeaderboardEntrySchema.partial().parse(req.body);

    // Verify entry exists
    const existingEntry = await prisma.leaderboardEntry.findUnique({
      where: { id },
    });

    if (!existingEntry) {
      return res.status(404).json({ error: "Leaderboard entry not found" });
    }

    // If communityId or sportId is being updated, verify they exist
    if (data.communityId) {
      const community = await prisma.community.findUnique({
        where: { id: data.communityId },
      });
      if (!community) {
        return res.status(404).json({ error: "Community not found" });
      }
    }

    if (data.sportId) {
      const sport = await prisma.sport.findUnique({
        where: { id: data.sportId },
      });
      if (!sport) {
        return res.status(404).json({ error: "Sport not found" });
      }
    }

    // Check for duplicate if communityId or sportId is being changed
    if (data.communityId || data.sportId) {
      const newCommunityId = data.communityId || existingEntry.communityId;
      const newSportId = data.sportId || existingEntry.sportId;

      if (newCommunityId !== existingEntry.communityId || newSportId !== existingEntry.sportId) {
        const duplicate = await prisma.leaderboardEntry.findUnique({
          where: {
            communityId_sportId: {
              communityId: newCommunityId,
              sportId: newSportId,
            },
          },
        });

        if (duplicate && duplicate.id !== id) {
          return res.status(409).json({ error: "Entry already exists for this community and sport" });
        }
      }
    }

    const updateData: any = {};
    if (data.communityId !== undefined) updateData.communityId = data.communityId;
    if (data.sportId !== undefined) updateData.sportId = data.sportId;
    if (data.score !== undefined) updateData.score = data.score;
    if (data.position !== undefined) updateData.position = data.position ?? null;
    if (data.medalType !== undefined) updateData.medalType = (data.medalType as MedalType) || "none";
    if (data.notes !== undefined) updateData.notes = data.notes ?? null;

    const entry = await prisma.leaderboardEntry.update({
      where: { id },
      data: updateData,
      include: {
        community: {
          select: {
            id: true,
            name: true,
          },
        },
        sport: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    res.json(entry);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Leaderboard entry not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update leaderboard entry" });
  }
});

// Delete score entry (root admin only)
router.delete("/:id", authenticate, requireRole("admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    await prisma.leaderboardEntry.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Leaderboard entry not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete leaderboard entry" });
  }
});

export default router;


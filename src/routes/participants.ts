import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { filterByAssignedSport, isSportsRepRole } from "../utils/sportAccess";
import { ParticipantStatus, Gender, Role, Prisma } from "@prisma/client";
import { hashPassword } from "../utils/password";
import { sendEmail } from "../utils/email";
import { sendExport } from "../utils/export";
import {
  buildCommunitySportMatrix,
  matrixToSheetRows,
  parseMatrixStatus,
} from "../utils/communitySportMatrix";

const router = Router();

// Configure multer for bulk upload files
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const bulkUploadStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `bulk-upload-${uniqueSuffix}${ext}`);
  },
});

const bulkUploadFileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  const allowedExts = [".csv", ".xlsx", ".xls"];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only CSV and Excel files are allowed."));
  }
};

const bulkUpload = multer({
  storage: bulkUploadStorage,
  fileFilter: bulkUploadFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB limit
  },
});

const createParticipantSchema = z.object({
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  lastName: z.string().min(1),
  gender: z.enum(["male", "female"]),
  dob: z.string().or(z.date()),
  email: z.string().email(),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(30, "Username must be at most 30 characters")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only include letters, numbers, underscores, hyphens or dots"),
  phone: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  communityId: z.string().min(1, "Community ID is required"),
  nextOfKin: z.object({
    firstName: z.string().min(1),
    middleName: z.string().optional(),
    lastName: z.string().min(1),
    phone: z.string().min(1),
  }),
  sports: z.array(
    z.union([
      z.string().min(1, "Invalid sport ID"),
      z.object({
        sportId: z.string().min(1, "Invalid sport ID"),
        notes: z.string().max(500).optional().nullable(),
      }),
    ])
  ).min(1, "At least one sport must be selected"),
  teamName: z.string().optional(),
  teamNames: z.record(z.string(), z.string()).optional(),
  notes: z.string().max(500).optional().nullable(),
});

function getSportIdsFromInput(sports: any[]): string[] {
  return sports
    .map((sport: any) => (typeof sport === "string" ? sport : sport?.sportId))
    .filter((sportId: unknown): sportId is string => typeof sportId === "string" && sportId.length > 0);
}

async function getActiveSportSelectionError(sportIds: string[]): Promise<string | null> {
  const uniqueSportIds = [...new Set(sportIds)];
  const sports = await prisma.sport.findMany({
    where: { id: { in: uniqueSportIds } },
    select: { id: true, name: true, active: true },
  });

  const foundSportIds = new Set(sports.map((sport) => sport.id));
  if (uniqueSportIds.some((sportId) => !foundSportIds.has(sportId))) {
    return "One or more selected sports are unavailable.";
  }

  const inactiveSports = sports.filter((sport) => !sport.active);
  if (inactiveSports.length > 0) {
    return `Inactive sports cannot be selected: ${inactiveSports.map((sport) => sport.name).join(", ")}`;
  }

  return null;
}

// Public participant stats for the main dashboard
router.get("/stats", async (_req: AuthRequest, res: Response) => {
  try {
    const [totalRegistered, totalAccepted, participantSports, communities, participantsByCommunity] = await Promise.all([
      prisma.participant.count(),
      prisma.participant.count({ where: { status: ParticipantStatus.accepted } }),
      prisma.participantSport.findMany({
        select: {
          sportId: true,
          participant: { select: { status: true } },
        },
      }),
      prisma.community.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.participant.findMany({
        select: {
          communityId: true,
          status: true,
        },
      }),
    ]);

    const bySportId: Record<string, { registered: number; accepted: number }> = {};
    for (const ps of participantSports) {
      if (!bySportId[ps.sportId]) {
        bySportId[ps.sportId] = { registered: 0, accepted: 0 };
      }
      bySportId[ps.sportId].registered++;
      if (ps.participant.status === ParticipantStatus.accepted) {
        bySportId[ps.sportId].accepted++;
      }
    }

    const byCommunity = communities.map((community) => {
      const counts = {
        communityId: community.id,
        communityName: community.name,
        total: 0,
        accepted: 0,
        rejected: 0,
        pending: 0,
      };

      for (const participant of participantsByCommunity) {
        if (participant.communityId !== community.id) continue;
        counts.total++;
        if (participant.status === ParticipantStatus.accepted) counts.accepted++;
        if (participant.status === ParticipantStatus.rejected) counts.rejected++;
        if (participant.status === ParticipantStatus.pending) counts.pending++;
      }

      return counts;
    });

    res.json({ totalRegistered, totalAccepted, bySportId, byCommunity });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch participant stats" });
  }
});

async function fetchCommunitySportMatrixData(statusFilter?: ParticipantStatus) {
  const participantWhere: Prisma.ParticipantWhereInput = {};
  if (statusFilter) {
    participantWhere.status = statusFilter;
  }

  const [sports, communities, participantSports] = await Promise.all([
    prisma.sport.findMany({
      where: { active: true },
      select: { id: true, name: true, active: true, parentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.community.findMany({
      select: { id: true, name: true, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.participantSport.findMany({
      where: {
        participant: participantWhere,
      },
      select: {
        sportId: true,
        participant: { select: { communityId: true } },
      },
    }),
  ]);

  return buildCommunitySportMatrix({
    sports,
    communities,
    participantSports: participantSports.map((ps) => ({
      sportId: ps.sportId,
      communityId: ps.participant.communityId,
    })),
  });
}

// Community vs Sport matrix (admin overview)
router.get(
  "/community-sport-matrix",
  authenticate,
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const status = parseMatrixStatus(req.query.status);
      const matrix = await fetchCommunitySportMatrixData(status);
      res.json(matrix);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch community sport matrix" });
    }
  }
);

// Export community vs sport matrix
router.get(
  "/export/community-sport-matrix/:format",
  authenticate,
  requireRole("admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { format } = req.params;
      if (!["csv", "excel"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use 'csv' or 'excel'" });
      }

      const status = parseMatrixStatus(req.query.status);
      const matrix = await fetchCommunitySportMatrixData(status);
      const sheetRows = matrixToSheetRows(matrix);

      if (format === "csv") {
        const csv = sheetRows
          .map((row) =>
            row
              .map((cell) => {
                const value = String(cell);
                if (value.includes(",") || value.includes("\n") || value.includes('"')) {
                  return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
              })
              .join(",")
          )
          .join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="community-vs-sport.csv"'
        );
        return res.send(csv);
      }

      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
      worksheet["!cols"] = sheetRows[0].map((header, index) => ({
        wch: Math.min(
          Math.max(
            String(header).length,
            ...sheetRows.slice(1).map((row) => String(row[index] ?? "").length)
          ),
          40
        ),
      }));
      XLSX.utils.book_append_sheet(workbook, worksheet, "Community vs Sport");
      const buffer = Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="community-vs-sport.xlsx"'
      );
      res.send(buffer);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to export community sport matrix" });
    }
  }
);

// List all participants (admin, community_admin, sports_admin, sports_super_admin)
router.get("/", authenticate, requireRole("admin", "community_admin", "sports_admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {};
    
    // Community admins can only see their community's participants
    if (req.user!.role === "community_admin" && req.user!.communityId) {
      where.communityId = req.user!.communityId;
      console.log(`[Participants] Filtering by communityId: ${req.user!.communityId} for user: ${req.user!.username}`);
    }

    const participants = await prisma.participant.findMany({
      where,
      include: {
        community: true,
        user: {
          select: {
            username: true,
          },
        },
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    
    // Include pendingSports in the response
    const participantsWithPending = participants.map((p: any) => ({
      ...p,
      pendingSports: p.pendingSports,
    }));
    
    // Debug logging for community admins
    if (req.user!.role === "community_admin") {
      console.log(`[Participants] Found ${participants.length} participants for community ${req.user!.communityId}`);
      participants.forEach((p: any) => {
        console.log(`[Participants] - ${p.email} (${p.firstName} ${p.lastName}) - communityId: ${p.communityId}, status: ${p.status}`);
      });
    }

    // Sports roles can only see participants registered for their sport
    if (isSportsRepRole(req.user!.role) && req.user!.sportId) {
      const filtered = filterByAssignedSport(participantsWithPending, req.user!.sportId);
      return res.json(filtered);
    }

    res.json(participantsWithPending);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list participants" });
  }
});

// Get my participant (for regular users)
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const participant = await prisma.participant.findUnique({
      where: { userId: req.user!.id },
      include: {
        community: true,
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
    });

    res.json(participant);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get participant" });
  }
});

// Create participant
router.post("/", async (req: AuthRequest, res: Response) => {
  let createdUserId: string | null = null;
  try {
    const data = createParticipantSchema.parse(req.body);

    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });

    if (existingUsername) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Parse date
    const dob = typeof data.dob === "string" ? new Date(data.dob) : data.dob;

    // Normalize sports array - extract sportIds for validation
    const sportIds = getSportIdsFromInput(data.sports);
    const activeSportError = await getActiveSportSelectionError(sportIds);
    if (activeSportError) {
      return res.status(400).json({ error: activeSportError });
    }

    // Check for incompatible sports
    if (sportIds.length > 1) {
      const selectedSports = await prisma.sport.findMany({
        where: { id: { in: sportIds } },
        include: {
          incompatibleWith: {
            include: {
              incompatibleSport: true,
            },
          },
        } as any,
      });

      // Check if any selected sports are incompatible with each other
      for (const sport of selectedSports) {
        const incompatibleIds = sport.incompatibleWith.map((inc: any) => inc.incompatibleSportId);
        const hasIncompatible = sportIds.some(
          (selectedId) => selectedId !== sport.id && incompatibleIds.includes(selectedId)
        );

        if (hasIncompatible) {
          const incompatibleSport = selectedSports.find((s) => incompatibleIds.includes(s.id));
          return res.status(400).json({
            error: `Cannot select ${sport.name} and ${incompatibleSport?.name || "another incompatible sport"} together. These sports are incompatible.`,
          });
        }
      }
    }

    // Hash password
    const hashedPassword = await hashPassword(data.password);

    // Create user account first
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password: hashedPassword,
        role: Role.user,
      },
    });

    createdUserId = user.id;

    const participantData: Prisma.ParticipantUncheckedCreateInput = {
      firstName: data.firstName,
      middleName: data.middleName,
      lastName: data.lastName,
      gender: data.gender as Gender,
      dob,
      email: data.email,
      phone: data.phone,
      communityId: data.communityId,
      nextOfKin: data.nextOfKin as any,
      teamName: data.teamName ?? null,
      teamNames: data.teamNames ? (data.teamNames as any) : undefined,
      userId: user.id,
      sports: {
        create: data.sports.map((s: any) => {
          if (typeof s === "string") {
            return { sportId: s };
          }
          return {
            sportId: s.sportId,
            notes: s.notes && s.notes.trim().length > 0 ? s.notes.trim() : null,
          };
        }),
      },
    };

    if (data.notes !== undefined) {
      (participantData as any).notes =
        data.notes && data.notes.trim().length > 0 ? data.notes.trim() : null;
    }

    const participant = await prisma.participant.create({
      data: participantData,
      include: {
        community: true,
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
    });

    res.status(201).json(participant);
  } catch (error: any) {
    if (createdUserId) {
      try {
        await prisma.user.delete({
          where: { id: createdUserId },
        });
      } catch {
        // Ignore cleanup errors
      }
    }

    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }

    res.status(500).json({ error: error.message || "Failed to create participant" });
  }
});

// Update participant status
router.patch("/:id/status", authenticate, requireRole("admin", "community_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["pending", "accepted", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    // Check if participant exists
    const participant = await prisma.participant.findUnique({
      where: { id },
      include: {
        sports: {
          include: {
            sport: true,
          },
        },
      },
    }) as any;

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    // Community admins can only update their community's participants
    if (req.user!.role === "community_admin" && participant.communityId !== req.user!.communityId) {
      return res.status(403).json({ error: "Access denied" });
    }

    let updateData: any = { status: status as ParticipantStatus };
    
    if (status === "accepted" && participant.pendingSports) {
      const pendingSports = participant.pendingSports as any[];
      
      // Delete existing sports
      await prisma.participantSport.deleteMany({
        where: { participantId: participant.id },
      });

      // Create new sports from pendingSports (handle both string IDs and objects)
      if (pendingSports.length > 0) {
        await prisma.participantSport.createMany({
          data: pendingSports.map((s: any) => {
            if (typeof s === "string") {
              return {
                participantId: participant.id,
                sportId: s,
              };
            }
            return {
              participantId: participant.id,
              sportId: s.sportId,
              notes: s.notes && s.notes.trim().length > 0 ? s.notes.trim() : null,
            };
          }),
        });
      }

      // Clear pendingSports
      updateData.pendingSports = null;
    } else if (status === "rejected" && participant.pendingSports) {
      // Clear pendingSports on rejection
      updateData.pendingSports = null;
    }

    const updated = await prisma.participant.update({
      where: { id },
      data: updateData,
      include: {
        community: true,
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
    });

    // Send email notification based on status change
    if (status === "accepted" || status === "rejected") {
      try {
        const participantName = `${updated.firstName} ${updated.middleName || ""} ${updated.lastName}`.trim();
        const communityName = updated.community?.name || "your community";
        const sportNames = updated.sports.map((ps: any) => ps.sport.name).join(", ");
        
        let emailSubject = "";
        let emailBody = "";
        
        if (status === "accepted") {
          emailSubject = "FOF 2026 - Registration Accepted!";
          emailBody = `
Dear ${participantName},

Congratulations! Your registration for the Festival of Friendship (FOF) 2026 has been accepted!

You have been accepted into ${communityName} for the following sports:
${sportNames}

You can now log in to your account and access your dashboard to view your registration details and upcoming events.

If you have any questions, please don't hesitate to contact us.

Best regards,
FOF 2026 Team
          `.trim();
        } else if (status === "rejected") {
          emailSubject = "FOF 2026 - Registration Update";
          emailBody = `
Dear ${participantName},

Thank you for your interest in the Festival of Friendship (FOF) 2026.

Unfortunately, we are unable to accept your registration at this time. If you have any questions or would like to discuss this further, please contact us.

We appreciate your understanding.

Best regards,
FOF 2026 Team
          `.trim();
        }

        // Send the email
        await sendEmail({
          to: updated.email,
          subject: emailSubject,
          body: emailBody,
          from: process.env.REGISTRATION_EMAIL || process.env.SMTP_USER || "registration@fof.co.ke",
        });

        // Store in database for record keeping
        await prisma.email.create({
          data: {
            to: updated.email,
            from: process.env.REGISTRATION_EMAIL || process.env.SMTP_USER || "registration@fof.co.ke",
            subject: emailSubject,
            body: emailBody,
          },
        });
      } catch (emailError: any) {
        // Log email error but don't fail the status update
        console.error("Failed to send status notification email:", emailError);
        // Continue with the response even if email fails
      }
    }

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update status" });
  }
});

// Helper function to check if profile updates are frozen
async function isProfileFrozen(): Promise<{ frozen: boolean; freezeDate: Date | null }> {
  const settings = await prisma.settings.findFirst();
  if (!settings) {
    return { frozen: false, freezeDate: null };
  }
  const profileFreezeDate = (settings as any).profileFreezeDate;
  if (!profileFreezeDate) {
    return { frozen: false, freezeDate: null };
  }
  const now = new Date();
  const freezeDate = new Date(profileFreezeDate);
  // Set time to end of day for freeze date
  freezeDate.setHours(23, 59, 59, 999);
  return { frozen: now > freezeDate, freezeDate: profileFreezeDate };
}

// Update participant profile details
router.patch("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Check if profile updates are frozen
    const freezeCheck = await isProfileFrozen();
    if (freezeCheck.frozen) {
      return res.status(403).json({ 
        error: "Profile updates are frozen", 
        message: `Profile updates are no longer allowed after ${freezeCheck.freezeDate ? new Date(freezeCheck.freezeDate).toLocaleDateString() : 'the freeze date'}. Please contact an administrator if you need to make changes.` 
      });
    }

    const updateSchema = z.object({
      firstName: z.string().min(1).optional(),
      middleName: z.string().optional().nullable(),
      lastName: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      nextOfKin: z.object({
        firstName: z.string().min(1),
        middleName: z.string().optional().nullable(),
        lastName: z.string().min(1),
        phone: z.string().min(1),
      }).optional(),
      teamName: z.string().optional().nullable(),
      teamNames: z.record(z.string(), z.string()).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    });

    const data = updateSchema.parse(req.body);

    const participant = await prisma.participant.findUnique({
      where: { userId: req.user!.id },
    });

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    const updateData: any = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.middleName !== undefined) updateData.middleName = data.middleName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.nextOfKin !== undefined) updateData.nextOfKin = data.nextOfKin as any;
    if (data.teamName !== undefined) updateData.teamName = data.teamName;
    if (data.teamNames !== undefined) updateData.teamNames = data.teamNames as any;
    if (data.notes !== undefined) {
      updateData.notes = data.notes && data.notes.trim().length > 0 ? data.notes.trim() : null;
    }

    const updated = await prisma.participant.update({
      where: { id: participant.id },
      data: updateData,
      include: {
        community: true,
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to update participant" });
  }
});

// Update participant sports
router.patch("/me/sports", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Check if profile updates are frozen
    const freezeCheck = await isProfileFrozen();
    if (freezeCheck.frozen) {
      return res.status(403).json({ 
        error: "Sports selection updates are frozen", 
        message: `Sports selection updates are no longer allowed after ${freezeCheck.freezeDate ? new Date(freezeCheck.freezeDate).toLocaleDateString() : 'the freeze date'}. Please contact an administrator if you need to make changes.` 
      });
    }

    const { sports } = req.body;

    if (!Array.isArray(sports)) {
      return res.status(400).json({ error: "sports must be an array" });
    }

    // Normalize sports array - extract sportIds for validation
    const sportIds = getSportIdsFromInput(sports);
    const activeSportError = await getActiveSportSelectionError(sportIds);
    if (activeSportError) {
      return res.status(400).json({ error: activeSportError });
    }

    const participant = await prisma.participant.findUnique({
      where: { userId: req.user!.id },
      include: {
        sports: true,
      },
    });

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    // Check if sports have actually changed
    const currentSportIds = participant.sports.map((ps: any) => ps.sportId).sort();
    const newSportIds = [...sportIds].sort();
    const sportsChanged = JSON.stringify(currentSportIds) !== JSON.stringify(newSportIds);

    if (!sportsChanged) {
      // No change, return current participant
      const updated = await prisma.participant.findUnique({
        where: { id: participant.id },
        include: {
          community: true,
          sports: {
            where: {
              sport: { active: true },
            },
            include: {
              sport: true,
            },
          },
        },
      });
      return res.json(updated);
    }

    // If participant was previously accepted, set status to pending and store new sports in pendingSports
    // If already pending, just update pendingSports with the latest selection
    const updateData: any = {
      pendingSports: sports, // Store full sports array with notes
    };

    // Only set status to pending if it was previously accepted
    if (participant.status === "accepted") {
      updateData.status = "pending";
    }

    await prisma.participant.update({
      where: { id: participant.id },
      data: updateData,
    });

    const updated = await prisma.participant.findUnique({
      where: { id: participant.id },
      include: {
        community: true,
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update sports" });
  }
});

// Delete participant
router.delete("/:id", authenticate, requireRole("admin", "community_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const participant = await prisma.participant.findUnique({
      where: { id },
      include: {
        sports: {
          include: {
            sport: true,
          },
        },
      },
    });

    if (!participant) {
      return res.status(404).json({ error: "Participant not found" });
    }

    // Community admins can only delete their community's participants
    if (req.user!.role === "community_admin" && participant.communityId !== req.user!.communityId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await prisma.participant.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete participant" });
  }
});

// Helper function to generate username from email
function generateUsernameFromEmail(email: string): string {
  let prefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  
  // If prefix is too short or empty, generate a random one
  if (prefix.length < 3) {
    prefix = "user" + Math.random().toString(36).substring(2, 8);
  }
  
  // Ensure it's not longer than 30 characters
  if (prefix.length > 27) {
    prefix = prefix.substring(0, 27);
  }
  
  return prefix;
}

// Helper function to generate random password
function generatePassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let password = "";
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Helper function to parse date from various formats
function parseDate(dateStr: string): Date | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  
  const trimmed = dateStr.trim();
  
  // Try ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try DD/MM/YYYY or MM/DD/YYYY
  const slashParts = trimmed.split("/");
  if (slashParts.length === 3) {
    const [a, b, c] = slashParts.map(Number);
    // Try DD/MM/YYYY first
    if (a <= 31 && b <= 12) {
      const date = new Date(c, b - 1, a);
      if (!isNaN(date.getTime())) return date;
    }
    // Try MM/DD/YYYY
    if (a <= 12 && b <= 31) {
      const date = new Date(c, a - 1, b);
      if (!isNaN(date.getTime())) return date;
    }
  }
  
  // Try Excel serial date (if it's a number)
  const num = Number(trimmed);
  if (!isNaN(num) && num > 0) {
    // Excel epoch is 1900-01-01, but Excel incorrectly treats 1900 as a leap year
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Try general Date parsing
  const date = new Date(trimmed);
  if (!isNaN(date.getTime())) return date;
  
  return null;
}

// Helper function to normalize column names (case-insensitive)
function normalizeColumnName(name: string): string {
  // Remove asterisks and extra whitespace, then normalize
  const cleaned = name.trim().replace(/\*/g, "").trim();
  const normalized = cleaned.toLowerCase().replace(/\s+/g, "");
  const mappings: Record<string, string> = {
    firstname: "firstName",
    "first_name": "firstName",
    "first name": "firstName",
    lastname: "lastName",
    "last_name": "lastName",
    "last name": "lastName",
    middlename: "middleName",
    "middle_name": "middleName",
    "middle name": "middleName",
    email: "email",
    phone: "phone",
    "phone number": "phone",
    phonenumber: "phone",
    "phone_number": "phone",
    dob: "dob",
    "date of birth": "dob",
    dateofbirth: "dob",
    "date_of_birth": "dob",
    birthdate: "dob",
    "birth date": "dob",
    gender: "gender",
    username: "username",
    password: "password",
    paymentdetails: "paymentDetails",
    "payment details": "paymentDetails",
    "payment_details": "paymentDetails",
    nextofkinfirstname: "nextOfKinFirstName",
    "next of kin first name": "nextOfKinFirstName",
    "next_of_kin_first_name": "nextOfKinFirstName",
    nextofkinlastname: "nextOfKinLastName",
    "next of kin last name": "nextOfKinLastName",
    "next_of_kin_last_name": "nextOfKinLastName",
    nextofkinmiddlename: "nextOfKinMiddleName",
    "next of kin middle name": "nextOfKinMiddleName",
    "next_of_kin_middle_name": "nextOfKinMiddleName",
    nextofkinphone: "nextOfKinPhone",
    "next of kin phone": "nextOfKinPhone",
    "next_of_kin_phone": "nextOfKinPhone",
    sports: "sports",
    community: "community",
  };
  return mappings[normalized] || normalized;
}

// Bulk upload participants
router.post(
  "/bulk-upload",
  authenticate,
  requireRole("community_admin"),
  bulkUpload.single("file"),
  async (req: AuthRequest, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    if (!req.user!.communityId) {
      return res.status(403).json({ error: "Community admin must be associated with a community" });
    }

    const communityId = req.user!.communityId;
    const filePath = req.file.path;
    const fileExt = path.extname(req.file.originalname).toLowerCase();

    let workbook: XLSX.WorkBook;
    let rows: any[] = [];

    try {
      // Parse file based on extension
      if (fileExt === ".csv") {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        workbook = XLSX.read(fileContent, { type: "string" });
      } else {
        workbook = XLSX.readFile(filePath);
      }

      // Get first sheet (skip "Instructions" sheet if it exists)
      const dataSheetName = workbook.SheetNames.find(name => 
        !name.toLowerCase().includes("instruction") && 
        !name.toLowerCase().includes("readme")
      ) || workbook.SheetNames[0];
      const worksheet = workbook.Sheets[dataSheetName];
      
      // Convert to JSON, skipping empty rows
      rows = XLSX.utils.sheet_to_json(worksheet, { 
        raw: false,
        defval: "", // Default value for empty cells
        blankrows: false, // Skip blank rows
      });

      // Filter out rows that are completely empty or are clearly instruction rows
      rows = rows.filter((row: any) => {
        // Check if row has any meaningful data
        const values = Object.values(row);
        const keys = Object.keys(row);
        
        // Skip if this looks like a header row (all keys are field names)
        const allKeysAreFieldNames = keys.every(key => {
          const normalized = normalizeColumnName(key);
          return normalized === "firstname" || normalized === "email" || normalized === "lastname";
        });
        if (allKeysAreFieldNames && values.every(v => !v || String(v).trim() === "")) {
          return false; // Skip header row
        }
        
        const hasData = values.some((val: any) => {
          const str = String(val || "").trim().toLowerCase();
          // Skip rows that look like instructions or headers
          return str && 
                 !str.startsWith("field description") &&
                 !str.startsWith("required field") &&
                 !str.startsWith("optional field") &&
                 !str.startsWith("important note") &&
                 !str.startsWith("bulk upload") &&
                 !str.startsWith("instruction") &&
                 !str.startsWith("not") &&
                 str !== "";
        });
        return hasData;
      });

      if (rows.length === 0) {
        return res.status(400).json({ error: "File is empty or contains no data" });
      }
    } catch (error: any) {
      // Clean up file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: `Failed to parse file: ${error.message}` });
    }

    const results = {
      successCount: 0,
      skippedCount: 0,
      errorCount: 0,
      skipped: [] as Array<{ row: number; email: string; reason: string }>,
      errors: [] as Array<{ row: number; email?: string; errors: string[] }>,
    };

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and arrays are 0-indexed
      
      // Skip if this looks like a header row (check if first column value looks like a field name)
      const firstValue = Object.values(row)[0];
      const firstKey = Object.keys(row)[0];
      const firstKeyNormalized = normalizeColumnName(firstKey || "");
      
      // Skip if first column is a field name and the value is also a field name or empty
      if (firstKeyNormalized === "firstname" && 
          (String(firstValue || "").toLowerCase().includes("firstname") || !firstValue)) {
        continue; // Skip header row
      }
      
      // Normalize column names
      const normalizedRow: any = {};
      for (const key in row) {
        const normalizedKey = normalizeColumnName(key);
        const value = row[key];
        // Only add non-empty values or keep empty strings for validation
        normalizedRow[normalizedKey] = value !== null && value !== undefined ? value : "";
      }
      
      // Extract and check basic fields to skip instruction rows
      const rowEmail = normalizedRow.email?.toString().trim() || "";
      const rowFirstName = normalizedRow.firstName?.toString().trim() || "";
      
      // Skip rows that don't have at least email or firstName (likely instruction rows)
      // Also skip if the row only contains field names (instruction text)
      if (!rowEmail && !rowFirstName) {
        continue; // Skip rows without basic participant data
      }
      
      // Additional check: if the row values look like field descriptions, skip it
      const allValues = Object.values(normalizedRow).map(v => String(v || "").toLowerCase().trim());
      const looksLikeInstructions = allValues.some(v => 
        v.includes("required") || 
        v.includes("optional") || 
        v.includes("field") ||
        v.includes("description") ||
        (v.length > 50 && !v.includes("@")) // Long text without email is likely instructions
      );
      if (looksLikeInstructions && !rowEmail) {
        continue; // Skip instruction-like rows
      }

      // Validate required fields
      const validationErrors: string[] = [];
      const email = rowEmail;
      const firstName = rowFirstName;
      const lastName = normalizedRow.lastName?.toString().trim() || "";
      const phone = normalizedRow.phone?.toString().trim() || "";
      const dobStr = normalizedRow.dob?.toString().trim() || "";
      const gender = normalizedRow.gender?.toString().trim().toLowerCase() || "";
      const middleName = normalizedRow.middleName?.toString().trim() || undefined;
      const username = normalizedRow.username?.toString().trim() || "";
      const password = normalizedRow.password?.toString().trim() || "";
      
      // Extract next of kin fields
      const nextOfKinFirstName = normalizedRow.nextOfKinFirstName?.toString().trim() || "";
      const nextOfKinLastName = normalizedRow.nextOfKinLastName?.toString().trim() || "";
      const nextOfKinMiddleName = normalizedRow.nextOfKinMiddleName?.toString().trim() || undefined;
      const nextOfKinPhone = normalizedRow.nextOfKinPhone?.toString().trim() || "";
      
      // Extract payment details (maps to notes field)
      const paymentDetails = normalizedRow.paymentDetails?.toString().trim() || "";
      
      // Extract sports (comma-separated list)
      const sportsStr = normalizedRow.sports?.toString().trim() || "";

      // Extract teamNames column (format: "SportName: TeamName, Sport2: TeamName2")
      const teamNamesStr = normalizedRow.teamNames?.toString().trim() || normalizedRow.teamnames?.toString().trim() || "";
      
      // Extract community (optional - will use admin's community if not provided)
      const communityName = normalizedRow.community?.toString().trim() || "";

      // Validate required fields
      if (!firstName) validationErrors.push("firstName is required");
      if (!lastName) validationErrors.push("lastName is required");
      if (!email) validationErrors.push("email is required");
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        validationErrors.push("email must be a valid email address");
      }
      if (!phone) validationErrors.push("phone is required");
      if (!dobStr) validationErrors.push("dob is required");
      const dob = parseDate(dobStr);
      if (!dobStr || !dob) {
        validationErrors.push("dob must be a valid date (format: YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY)");
      }
      if (!gender) validationErrors.push("gender is required");
      if (gender && !["male", "female"].includes(gender)) {
        validationErrors.push("gender must be 'male' or 'female'");
      }
      
      // Validate required next of kin fields
      if (!nextOfKinFirstName) validationErrors.push("nextOfKinFirstName is required");
      if (!nextOfKinLastName) validationErrors.push("nextOfKinLastName is required");
      if (!nextOfKinPhone) validationErrors.push("nextOfKinPhone is required");
      
      // Validate required payment details
      if (!paymentDetails) validationErrors.push("paymentDetails is required");
      
      // Validate required sports
      if (!sportsStr) validationErrors.push("sports is required");

      if (validationErrors.length > 0) {
        results.errorCount++;
        results.errors.push({
          row: rowNumber,
          email: email || undefined,
          errors: validationErrors,
        });
        continue;
      }

      // Generate username if not provided
      let finalUsername = username;
      if (!finalUsername) {
        finalUsername = generateUsernameFromEmail(email);
        // Ensure uniqueness by appending suffix if needed
        let counter = 1;
        let uniqueUsername = finalUsername;
        while (await prisma.user.findUnique({ where: { username: uniqueUsername } })) {
          uniqueUsername = `${finalUsername}${counter}`;
          counter++;
        }
        finalUsername = uniqueUsername;
      } else {
        // Validate username format
        if (!/^[a-zA-Z0-9_.-]+$/.test(finalUsername) || finalUsername.length < 3 || finalUsername.length > 30) {
          results.errorCount++;
          results.errors.push({
            row: rowNumber,
            email,
            errors: ["username must be 3-30 characters and contain only letters, numbers, underscores, hyphens, or dots"],
          });
          continue;
        }
      }

      // Check for duplicate username
      const existingUsername = await prisma.user.findUnique({
        where: { username: finalUsername },
      });

      if (existingUsername) {
        results.skippedCount++;
        results.skipped.push({
          row: rowNumber,
          email,
          reason: "Username already exists",
        });
        continue;
      }

      // Generate password if not provided
      const finalPassword = password || generatePassword();

      // Validate password
      if (finalPassword.length < 6) {
        results.errorCount++;
        results.errors.push({
          row: rowNumber,
          email,
          errors: ["password must be at least 6 characters"],
        });
        continue;
      }

      // Parse sports (comma-separated list)
      const sportNames = sportsStr.split(",").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
      if (sportNames.length === 0) {
        results.errorCount++;
        results.errors.push({
          row: rowNumber,
          email,
          errors: ["At least one sport is required"],
        });
        continue;
      }

      // Find sport IDs by name (case-insensitive)
      // Load all sports with parent relationships
      const allSports = await prisma.sport.findMany({
        where: { active: true },
        include: {
          parent: true,
        },
      });

      // Match sports by name (case-insensitive)
      // Support both "Child Name" and "Parent Name - Child Name" formats
      const matchedSports: Array<typeof allSports[0]> = [];
      const missingSports: string[] = [];

      for (const sportNameInput of sportNames) {
        let matched = false;
        
        // Check if format is "Parent Name - Child Name"
        if (sportNameInput.includes(" - ")) {
          const [parentName, childName] = sportNameInput.split(" - ").map((s: string) => s.trim());
          
          // Find parent sport
          const parentSport = allSports.find(
            (s) => !s.parentId && s.name.toLowerCase() === parentName.toLowerCase()
          );
          
          if (parentSport) {
            // Find child sport with this parent
            const childSport = allSports.find(
              (s) => s.parentId === parentSport.id && s.name.toLowerCase() === childName.toLowerCase()
            );
            
            if (childSport) {
              matchedSports.push(childSport);
              matched = true;
            }
          }
        }
        
        // If not matched yet, try direct name match (for sports without parents or just child name)
        if (!matched) {
          // First try exact match
          let sport = allSports.find(
            (s) => s.name.toLowerCase() === sportNameInput.toLowerCase()
          );
          
          // If not found and it might be a child sport, check if there's a unique child with this name
          if (!sport) {
            const sportsWithSameName = allSports.filter(
              (s) => s.name.toLowerCase() === sportNameInput.toLowerCase()
            );
            
            // If only one sport with this name, use it
            if (sportsWithSameName.length === 1) {
              sport = sportsWithSameName[0];
            } else if (sportsWithSameName.length > 1) {
              // Multiple sports with same name - need parent specification
              missingSports.push(`${sportNameInput} (multiple found - use "Parent Name - ${sportNameInput}" format)`);
              continue;
            }
          }
          
          if (sport) {
            // If it's a child sport, we should prefer the "Parent - Child" format, but allow direct match
            matchedSports.push(sport);
            matched = true;
          }
        }
        
        if (!matched) {
          missingSports.push(sportNameInput);
        }
      }

      if (missingSports.length > 0) {
        results.errorCount++;
        results.errors.push({
          row: rowNumber,
          email,
          errors: [`Sports not found: ${missingSports.join(", ")}`],
        });
        continue;
      }

      // Check for incompatible sports
      if (matchedSports.length > 1) {
        const sportIds = matchedSports.map((s) => s.id);
        let hasIncompatible = false;
        let incompatibleError = "";

        for (const sport of matchedSports) {
          const incompatibleIds = await prisma.sportIncompatibility.findMany({
            where: { sportId: sport.id },
            select: { incompatibleSportId: true },
          });

          const incompatibleSportIds = incompatibleIds.map((inc) => inc.incompatibleSportId);
          const conflictingId = sportIds.find(
            (selectedId) => selectedId !== sport.id && incompatibleSportIds.includes(selectedId)
          );

          if (conflictingId) {
            const incompatibleSport = matchedSports.find((s) => s.id === conflictingId);
            hasIncompatible = true;
            incompatibleError = `Cannot select ${sport.name} and ${incompatibleSport?.name || "another incompatible sport"} together. These sports are incompatible.`;
            break;
          }
        }

        if (hasIncompatible) {
          results.errorCount++;
          results.errors.push({
            row: rowNumber,
            email,
            errors: [incompatibleError],
          });
          continue;
        }
      }

      // Handle community if provided (otherwise use admin's community)
      let finalCommunityId = communityId;
      if (communityName) {
        const community = await prisma.community.findUnique({
          where: { name: communityName },
        });
        if (!community) {
          results.errorCount++;
          results.errors.push({
            row: rowNumber,
            email,
            errors: [`Community not found: ${communityName}`],
          });
          continue;
        }
        finalCommunityId = community.id;
      }

      // Create participant
      try {
        const hashedPassword = await hashPassword(finalPassword);

        // Create user account
        const user = await prisma.user.create({
          data: {
            username: finalUsername,
            email,
            password: hashedPassword,
            role: Role.user,
          },
        });

        // Build teamNames map from the teamNames column
        const teamNamesMap: Record<string, string> = {};
        const teamSports = matchedSports.filter((s) => (s as any).requiresTeamName);
        const teamNameErrors: string[] = [];

        if (teamNamesStr) {
          // Parse "SportName: TeamName, Sport2: TeamName2" format
          const entries = teamNamesStr.split(",");
          for (const entry of entries) {
            const colonIdx = entry.indexOf(":");
            if (colonIdx === -1) continue;
            const sportNameKey = entry.slice(0, colonIdx).trim().toLowerCase();
            const teamNameVal = entry.slice(colonIdx + 1).trim();
            // Match sport name to one of the matched sports
            const matched = matchedSports.find(
              (s) => s.name.toLowerCase() === sportNameKey ||
                     (s.parent && `${s.parent.name} - ${s.name}`.toLowerCase() === sportNameKey)
            );
            if (matched && teamNameVal) {
              teamNamesMap[matched.id] = teamNameVal;
            }
          }
        }

        // Validate: all team sports must have a team name
        for (const teamSport of teamSports) {
          if (!teamNamesMap[teamSport.id]) {
            teamNameErrors.push(`Team name required for "${teamSport.name}" — add it to the teamNames column (e.g., "${teamSport.name}: Your Team Name")`);
          }
        }

        if (teamNameErrors.length > 0) {
          results.errorCount++;
          results.errors.push({ row: rowNumber, email, errors: teamNameErrors });
          // Clean up the created user
          await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
          continue;
        }

        // Create participant with accepted status, including nextOfKin and notes
        const participant = await prisma.participant.create({
          data: {
            firstName,
            middleName: middleName || null,
            lastName,
            gender: gender as Gender,
            dob: dob!,
            email,
            phone,
            communityId: finalCommunityId,
            userId: user.id,
            status: ParticipantStatus.accepted,
            notes: paymentDetails || null,
            teamNames: Object.keys(teamNamesMap).length > 0 ? teamNamesMap as any : undefined,
            nextOfKin: {
              firstName: nextOfKinFirstName,
              middleName: nextOfKinMiddleName || undefined,
              lastName: nextOfKinLastName,
              phone: nextOfKinPhone,
            } as any,
            sports: {
              create: matchedSports.map((sport) => ({
                sportId: sport.id,
              })),
            },
          },
        });

        results.successCount++;
      } catch (error: any) {
        results.errorCount++;
        results.errors.push({
          row: rowNumber,
          email,
          errors: [error.message || "Failed to create participant"],
        });
      }
    }

    // Clean up uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("Failed to delete uploaded file:", error);
    }

    res.json(results);
  }
);

// Export participants
router.get("/export/:format", authenticate, requireRole("admin", "community_admin", "sports_admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { format } = req.params;
    if (!["csv", "excel"].includes(format)) {
      return res.status(400).json({ error: "Invalid format. Use 'csv' or 'excel'" });
    }

    const where: any = {};
    
    // Community admins can only see their community's participants
    if (req.user!.role === "community_admin" && req.user!.communityId) {
      where.communityId = req.user!.communityId;
    }

    const participants = await prisma.participant.findMany({
      where,
      include: {
        community: true,
        user: {
          select: {
            username: true,
          },
        },
        sports: {
          where: {
            sport: { active: true },
          },
          include: {
            sport: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Sports roles can only export participants registered for their sport
    let filteredParticipants = participants;
    if (isSportsRepRole(req.user!.role) && req.user!.sportId) {
      filteredParticipants = filterByAssignedSport(participants, req.user!.sportId);
    }

    const exportData = filteredParticipants.map((p: any) => {
      const sportsList = p.sports.map((ps: any) => {
        const sport = ps.sport;
        if (sport.parentId) {
          const parent = p.sports.find((ps2: any) => ps2.sport.id === sport.parentId)?.sport;
          return parent ? `${parent.name} - ${sport.name}` : sport.name;
        }
        return sport.name;
      }).join(", ");

      const nextOfKin = p.nextOfKin as any;
      // Build teamNames display string: "SportName: TeamName, ..."
      const teamNamesObj = (p.teamNames as Record<string, string> | null) || {};
      const teamNamesDisplay = Object.keys(teamNamesObj).length > 0
        ? Object.entries(teamNamesObj)
            .map(([sportId, name]) => {
              const sport = p.sports.find((ps: any) => ps.sport?.id === sportId)?.sport;
              return sport ? `${sport.name}: ${name}` : `${sportId}: ${name}`;
            })
            .join(", ")
        : "";
      return {
        username: p.user?.username || "",
        firstName: p.firstName,
        middleName: p.middleName || "",
        lastName: p.lastName,
        gender: p.gender,
        dob: p.dob.toISOString().split("T")[0],
        email: p.email,
        phone: p.phone,
        community: p.community?.name || "-",
        sports: sportsList || "-",
        teamName: p.teamName || "",
        teamNames: teamNamesDisplay,
        status: p.status,
        nextOfKinFirstName: nextOfKin?.firstName || "",
        nextOfKinMiddleName: nextOfKin?.middleName || "",
        nextOfKinLastName: nextOfKin?.lastName || "",
        nextOfKinPhone: nextOfKin?.phone || "",
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      };
    });

    const headers = [
      "username", "firstName", "middleName", "lastName", "gender", "dob", "email", "phone",
      "community", "sports", "teamName", "teamNames", "status",
      "nextOfKinFirstName", "nextOfKinMiddleName", "nextOfKinLastName", "nextOfKinPhone",
      "createdAt", "updatedAt"
    ];
    
    const filename = req.user!.role === "community_admin" 
      ? `participants-community-${req.user!.communityId}`
      : isSportsRepRole(req.user!.role)
      ? `participants-sport-${req.user!.sportId}`
      : "participants";
    
    sendExport(res, exportData, headers, { filename, format: format as "csv" | "excel" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to export participants" });
  }
});

export default router;



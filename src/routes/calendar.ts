import { Router, Response } from "express";
import { z } from "zod";
import multer from "multer";
import path from "path";
import * as XLSX from "xlsx";
import { prisma } from "../index";
import { authenticate, AuthRequest, requireRole } from "../middleware/auth";
import { assertSportEditAccess } from "../utils/sportAccess";
import { Prisma } from "@prisma/client";
import { uploadToSupabase } from "../utils/supabase";

const router = Router();

const calendarPdfFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (file.mimetype === "application/pdf" || ext === ".pdf") {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF files are allowed."));
  }
};

const calendarExcelFilter = (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedMimes = [
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ];
  if (allowedMimes.includes(file.mimetype) || [".xls", ".xlsx"].includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only Excel files are allowed."));
  }
};

const storage = multer.memoryStorage();

const uploadCalendarPdf = multer({
  storage: storage,
  fileFilter: calendarPdfFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});

const uploadCalendarExcel = multer({
  storage: storage,
  fileFilter: calendarExcelFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

type CalendarGridEntry = {
  date: string;
  events: string[];
};



function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseExcelDate(value: unknown): Date | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const slashMatch = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    const year = Number(slashMatch[3].length === 2 ? `20${slashMatch[3]}` : slashMatch[3]);
    const date = new Date(year, month - 1, day);
    if (!isNaN(date.getTime())) return date;
  }

  const date = new Date(raw);
  return isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function splitEvents(value: unknown): string[] {
  return String(value ?? "")
    .split(/\r?\n|,/)
    .map((event) => event.trim())
    .filter(Boolean);
}

function parseCalendarGridFromExcel(buffer: Buffer): CalendarGridEntry[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy",
  });
  return rows
    .map((row) => {
      const entries = Object.entries(row);
      const getValue = (names: string[]) => {
        const found = entries.find(([key]) => names.includes(normalizeHeader(key)));
        return found?.[1];
      };

      const rawDate = getValue(["date"]);
      const date = parseExcelDate(rawDate);
      const events = splitEvents(getValue(["listofevents", "events", "event"]));
      if (!date || events.length === 0) return null;

      return {
        date: toIsoDate(date),
        events,
      };
    })
    .filter((entry): entry is CalendarGridEntry => Boolean(entry))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getOrCreateSettings() {
  let settings = await prisma.settings.findFirst();
  if (!settings) {
    settings = await prisma.settings.create({
      data: {
        ageCalculatorDate: new Date("2026-11-01"),
        profileFreezeDate: null,
      },
    });
  }
  return settings;
}

const createCalendarItemSchema = z.object({
  sportId: z.string().min(1),
  date: z.string().or(z.date()),
  time: z.string().min(1),
  venue: z.string().min(1),
  type: z.string().min(1),
});

// List calendar items (public endpoint for home page)
router.get("/", async (req, res: Response) => {
  try {
    const calendarItems = await prisma.calendarItem.findMany({
      where: {
        sport: { active: true },
      },
      include: {
        sport: true,
      },
      orderBy: { date: "asc" },
    });

    res.json(calendarItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list calendar" });
  }
});

// List uploaded Excel calendar grid
router.get("/grid", async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings.calendarGrid || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list calendar grid" });
  }
});

// List timing (simplified calendar structure)
router.get("/timing", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const calendarItems = await prisma.calendarItem.findMany({
      select: {
        sportId: true,
        time: true,
        date: true,
        venue: true,
      },
      orderBy: { date: "asc" },
    });

    res.json(calendarItems);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list timing" });
  }
});

// List draws (placeholder - can be extended later)
router.get("/draws", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    res.json([
      { sportId: "1", url: "https://example.com/draws/football.pdf" },
      { sportId: "2", url: "https://example.com/draws/basketball.pdf" },
    ]);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list draws" });
  }
});

// Upload master sports calendar PDF (grid schedule)
router.post(
  "/upload-pdf",
  authenticate,
  requireRole("admin", "sports_super_admin"),
  uploadCalendarPdf.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No PDF file provided" });
      }

      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(req.file.originalname).toLowerCase() || ".pdf";
      const fileUrl = await uploadToSupabase(req.file, `calendar/calendar-${uniqueSuffix}${ext}`);

      const settings = await getOrCreateSettings();

      await prisma.settings.update({
        where: { id: settings.id },
        data: { calendarPdfUrl: fileUrl },
      });

      res.json({
        url: fileUrl,
        filename: req.file.originalname,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to upload calendar PDF" });
    }
  }
);

// Upload calendar Excel (Day, Date, List of events)
router.post(
  "/upload-excel",
  authenticate,
  requireRole("admin", "sports_super_admin"),
  uploadCalendarExcel.single("file"),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No Excel file provided" });
      }

      const calendarGrid = parseCalendarGridFromExcel(req.file.buffer);
      if (calendarGrid.length === 0) {
        return res.status(400).json({
          error: "No valid calendar rows found. Expected columns: Date, List of events.",
        });
      }

      const settings = await getOrCreateSettings();
      await prisma.settings.update({
        where: { id: settings.id },
        data: {
          calendarGrid: calendarGrid as any,
          calendarPdfUrl: null,
        },
      });

      res.json({ entries: calendarGrid.length, calendarGrid });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to upload calendar Excel" });
    }
  }
);

// Remove uploaded calendar grid
router.delete("/grid", authenticate, requireRole("admin", "sports_super_admin"), async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    await prisma.settings.update({
      where: { id: settings.id },
      data: { calendarGrid: Prisma.DbNull },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to remove calendar grid" });
  }
});

// Remove master calendar PDF
router.delete("/pdf", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    await prisma.settings.update({
      where: { id: settings.id },
      data: { calendarPdfUrl: null },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to remove calendar PDF" });
  }
});

// Get calendar item by ID
router.get("/:id", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const calendarItem = await prisma.calendarItem.findUnique({
      where: { id },
      include: {
        sport: true,
      },
    });

    if (!calendarItem) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    res.json(calendarItem);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get calendar item" });
  }
});

// Create calendar item
router.post("/", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const data = createCalendarItemSchema.parse(req.body);
    assertSportEditAccess(req, data.sportId);

    let date: Date;
    if (typeof data.date === "string") {
      date = new Date(data.date);
    } else {
      date = data.date;
    }

    const sport = await prisma.sport.findUnique({
      where: { id: data.sportId },
    });

    if (!sport) {
      return res.status(404).json({ error: "Sport not found" });
    }

    const calendarItem = await prisma.calendarItem.create({
      data: {
        sportId: data.sportId,
        date,
        time: data.time,
        venue: data.venue,
        type: data.type,
      },
      include: {
        sport: true,
      },
    });

    res.status(201).json(calendarItem);
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: error.message || "Forbidden" });
    }
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to create calendar item" });
  }
});

// Update calendar item
router.patch("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const data = createCalendarItemSchema.partial().parse(req.body);

    const existing = await prisma.calendarItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    const targetSportId = data.sportId ?? existing.sportId;
    assertSportEditAccess(req, targetSportId);

    const updateData: any = { ...data };
    if (data.date !== undefined) {
      updateData.date = typeof data.date === "string" ? new Date(data.date) : data.date;
    }

    const calendarItem = await prisma.calendarItem.update({
      where: { id },
      data: updateData,
      include: {
        sport: true,
      },
    });

    res.json(calendarItem);
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: error.message || "Forbidden" });
    }
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Calendar item not found" });
    }
    res.status(500).json({ error: error.message || "Failed to update calendar item" });
  }
});

// Delete calendar item
router.delete("/:id", authenticate, requireRole("admin", "sports_super_admin"), async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (id === "pdf") {
      return res.status(405).json({ error: "Use DELETE /calendar/pdf to remove the calendar PDF" });
    }

    const existing = await prisma.calendarItem.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: "Calendar item not found" });
    }

    assertSportEditAccess(req, existing.sportId);

    await prisma.calendarItem.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    if (error.status === 403) {
      return res.status(403).json({ error: error.message || "Forbidden" });
    }
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Calendar item not found" });
    }
    res.status(500).json({ error: error.message || "Failed to delete calendar item" });
  }
});

export default router;

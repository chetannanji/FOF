// server.ts (replace your current file with this)

import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { normalizeDatabaseUrl } from "./utils/database";
import authRoutes from "./routes/auth";
import participantRoutes from "./routes/participants";
import volunteerRoutes from "./routes/volunteers";
import sportRoutes from "./routes/sports";
import communityRoutes from "./routes/communities";
import userRoutes from "./routes/users";
import departmentRoutes from "./routes/departments";
import calendarRoutes from "./routes/calendar";
import settingsRoutes from "./routes/settings";
import emailRoutes from "./routes/email";
import communityContactRoutes from "./routes/community-contacts";
import convenorRoutes from "./routes/convenors";
import tournamentFormatRoutes from "./routes/tournament-formats";
import leaderboardRoutes from "./routes/leaderboard";
import { errorHandler } from "./middleware/errorHandler";
import { verifyEmailConfig } from "./utils/email";

dotenv.config();

/**
 * Normalize and log DB connection target so deploy logs show it.
 * (normalizeDatabaseUrl is kept as you had it)
 */
const databaseUrl = normalizeDatabaseUrl(process.env.DATABASE_URL || "");

try {
  const { hostname, port, protocol } = new URL(databaseUrl);
  console.log(
    `Database connection target: ${protocol}//${hostname}${port ? `:${port}` : ""}`
  );
} catch (error) {
  console.warn("Unable to determine database connection target:", error);
}

/**
 * Initialize Express & Prisma
 */
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
});

const app = express();
app.set("trust proxy", true);
const PORT = process.env.PORT || 3000;

/**
 * CORS configuration
 *
 * - Keep a small explicit allowlist of frontends / local dev URLs
 * - Place cors() BEFORE JSON parsing and route registration
 * - Use app.options('*', cors()) so preflight is handled automatically
 */
const defaultFrontendUrl = "https://fof.co.ke";
const FRONTEND_URL = process.env.FRONTEND_URL || defaultFrontendUrl;
const additionalOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const staticOrigins = [
  FRONTEND_URL,
  defaultFrontendUrl,
  "https://fof.co.ke",
  "https://www.fof.co.ke",
  "http://localhost:5173",
  "http://localhost:8080",
  "http://localhost:3000",
];

const allowedOrigins = Array.from(new Set([...staticOrigins, ...additionalOrigins]));

/** helper used by the cors origin callback */
function isAllowedOrigin(origin?: string | null): boolean {
  if (!origin) {
    // No origin (e.g., curl or same-origin) — allow
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  try {
    const url = new URL(origin);
    // Allow production domain and subdomains (e.g. www.fof.co.ke)
    if (url.hostname === "fof.co.ke" || url.hostname.endsWith(".fof.co.ke")) {
      return true;
    }
    // Allow any vercel.app subdomain (staging/preview deployments)
    if (url.hostname.endsWith(".vercel.app")) {
      return true;
    }
  } catch (err) {
    console.warn("Failed to parse origin for CORS check:", origin, err);
  }
  return false;
}

console.log("CORS allowed origins:", allowedOrigins);

const corsOptions: cors.CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }
    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  exposedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
  maxAge: 86400,
};

/**
 * CORS middleware — must use the same options for preflight (OPTIONS) requests.
 */
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/**
 * Simple request logger (helps confirm preflight hits the server)
 * keep this before routes
 */
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`→ ${req.method} ${req.originalUrl} | Origin: ${req.headers.origin}`);
  next();
});

/**
 * Body parsing
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Static file serving for uploaded images
 */
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));

/**
 * Health check
 */
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Mount routes (same as your original)
 */
app.use("/api/auth", authRoutes);
app.use("/api/participants", participantRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/sports", sportRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/departments", departmentRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/community-contacts", communityContactRoutes);
app.use("/api/convenors", convenorRoutes);
app.use("/api/tournament-formats", tournamentFormatRoutes);
app.use("/api/leaderboard", leaderboardRoutes);

/**
 * Error handling middleware (keep it last, before server close)
 * Your existing `errorHandler` is used; we also catch CORS errors explicitly here.
 */
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error:", err?.message ?? err);
  if (err?.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS not allowed for this origin" });
  }
  // Delegate to your error handler if you want more structured responses
  try {
    return errorHandler(err, _req as any, res as any, _next);
  } catch (e) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Start server
 */
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

  // run any startup checks / verifications you had before
  try {
    await verifyEmailConfig();
  } catch (err) {
    console.warn("verifyEmailConfig failed:", err);
  }
});

/**
 * Graceful shutdown — close HTTP server and disconnect prisma
 */
async function shutdown(signal: string) {
  console.log(`${signal} received: closing HTTP server`);
  server.close(async () => {
    console.log("HTTP server closed");
    try {
      await prisma.$disconnect();
      console.log("Prisma disconnected");
    } catch (err) {
      console.warn("Error disconnecting Prisma:", err);
    }
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

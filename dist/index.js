"use strict";
// server.ts (replace your current file with this)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const database_1 = require("./utils/database");
const auth_1 = __importDefault(require("./routes/auth"));
const participants_1 = __importDefault(require("./routes/participants"));
const volunteers_1 = __importDefault(require("./routes/volunteers"));
const sports_1 = __importDefault(require("./routes/sports"));
const communities_1 = __importDefault(require("./routes/communities"));
const users_1 = __importDefault(require("./routes/users"));
const departments_1 = __importDefault(require("./routes/departments"));
const calendar_1 = __importDefault(require("./routes/calendar"));
const settings_1 = __importDefault(require("./routes/settings"));
const email_1 = __importDefault(require("./routes/email"));
const community_contacts_1 = __importDefault(require("./routes/community-contacts"));
const convenors_1 = __importDefault(require("./routes/convenors"));
const tournament_formats_1 = __importDefault(require("./routes/tournament-formats"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const errorHandler_1 = require("./middleware/errorHandler");
const email_2 = require("./utils/email");
dotenv_1.default.config();
/**
 * Normalize and log DB connection target so deploy logs show it.
 * (normalizeDatabaseUrl is kept as you had it)
 */
const databaseUrl = (0, database_1.normalizeDatabaseUrl)(process.env.DATABASE_URL || "");
try {
    const { hostname, port, protocol } = new URL(databaseUrl);
    console.log(`Database connection target: ${protocol}//${hostname}${port ? `:${port}` : ""}`);
}
catch (error) {
    console.warn("Unable to determine database connection target:", error);
}
/**
 * Initialize Express & Prisma
 */
exports.prisma = new client_1.PrismaClient({
    datasources: {
        db: {
            url: databaseUrl,
        },
    },
});
const app = (0, express_1.default)();
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
function isAllowedOrigin(origin) {
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
    }
    catch (err) {
        console.warn("Failed to parse origin for CORS check:", origin, err);
    }
    return false;
}
console.log("CORS allowed origins:", allowedOrigins);
const corsOptions = {
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
app.use((0, cors_1.default)(corsOptions));
app.options(/.*/, (0, cors_1.default)(corsOptions));
/**
 * Simple request logger (helps confirm preflight hits the server)
 * keep this before routes
 */
app.use((req, _res, next) => {
    console.log(`→ ${req.method} ${req.originalUrl} | Origin: ${req.headers.origin}`);
    next();
});
/**
 * Body parsing
 */
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
/**
 * Static file serving for uploaded images
 */
const uploadsDir = path_1.default.join(process.cwd(), "uploads");
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express_1.default.static(uploadsDir));
/**
 * Health check
 */
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
/**
 * Mount routes (same as your original)
 */
app.use("/api/auth", auth_1.default);
app.use("/api/participants", participants_1.default);
app.use("/api/volunteers", volunteers_1.default);
app.use("/api/sports", sports_1.default);
app.use("/api/communities", communities_1.default);
app.use("/api/users", users_1.default);
app.use("/api/departments", departments_1.default);
app.use("/api/calendar", calendar_1.default);
app.use("/api/settings", settings_1.default);
app.use("/api/email", email_1.default);
app.use("/api/community-contacts", community_contacts_1.default);
app.use("/api/convenors", convenors_1.default);
app.use("/api/tournament-formats", tournament_formats_1.default);
app.use("/api/leaderboard", leaderboard_1.default);
/**
 * Error handling middleware (keep it last, before server close)
 * Your existing `errorHandler` is used; we also catch CORS errors explicitly here.
 */
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err?.message ?? err);
    if (err?.message === "Not allowed by CORS") {
        return res.status(403).json({ error: "CORS not allowed for this origin" });
    }
    // Delegate to your error handler if you want more structured responses
    try {
        return (0, errorHandler_1.errorHandler)(err, _req, res, _next);
    }
    catch (e) {
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
        await (0, email_2.verifyEmailConfig)();
    }
    catch (err) {
        console.warn("verifyEmailConfig failed:", err);
    }
});
/**
 * Graceful shutdown — close HTTP server and disconnect prisma
 */
async function shutdown(signal) {
    console.log(`${signal} received: closing HTTP server`);
    server.close(async () => {
        console.log("HTTP server closed");
        try {
            await exports.prisma.$disconnect();
            console.log("Prisma disconnected");
        }
        catch (err) {
            console.warn("Error disconnecting Prisma:", err);
        }
        process.exit(0);
    });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
//# sourceMappingURL=index.js.map
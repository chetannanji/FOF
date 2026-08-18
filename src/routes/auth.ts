import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../index";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { authenticate, AuthRequest } from "../middleware/auth";
import { Role } from "@prisma/client";

const router = Router();

const usernameFormatSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_.-]+$/, "Username can only include letters, numbers, underscores, hyphens or dots");

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const signupSchema = z.object({
  role: z.enum(["community", "volunteer"]),
  username: usernameFormatSchema,
  password: z.string().min(1),
  communityId: z.string().optional(),
  volunteerId: z.string().optional(),
});

const usernameAvailabilitySchema = z.object({
  username: usernameFormatSchema,
});

// Login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { username, password } = loginSchema.parse(req.body);

    // Find user by username only
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Compare password
    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    // Return user without password
    const { password: _, ...userWithoutPassword } = user;

    res.json({
      user: userWithoutPassword,
      token,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Login failed" });
  }
});

// Username availability
router.get("/username-availability", async (req: Request, res: Response) => {
  try {
    const { username } = usernameAvailabilitySchema.parse(req.query);

    const existing = await prisma.user.findUnique({
      where: { username },
    });

    res.json({ available: !existing });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Failed to check username availability" });
  }
});

// Get current user
router.get("/me", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get user" });
  }
});

// Logout (client-side token removal, but we can track it if needed)
router.post("/logout", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // In a stateless JWT system, logout is handled client-side
    // But we can add token blacklisting here if needed
    res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Logout failed" });
  }
});

// Signup
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const { role, username, password, communityId, volunteerId } = signupSchema.parse(req.body);

    // Check if username already exists
    const existingUser = await prisma.user.findUnique({
      where: { username },
    });

    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Map role
    const userRole: Role = role === "community" ? "community_admin" : "volunteer";

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        role: userRole,
        communityId,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        communityId: true,
        sportId: true,
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      username: user.username,
      role: user.role,
    });

    res.status(201).json({
      user,
      token,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: error.message || "Signup failed" });
  }
});

export default router;




import jwt from "jsonwebtoken";
import { JwtPayload } from "../types";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}




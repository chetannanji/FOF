import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error("Error:", err);

  if (err.name === "ValidationError" || err.name === "ZodError") {
    return res.status(400).json({
      error: "Validation error",
      message: err.message || "Invalid input",
    });
  }

  if (err.name === "PrismaClientKnownRequestError") {
    if (err.code === "P2002") {
      return res.status(409).json({
        error: "Duplicate entry",
        message: "A record with this value already exists",
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({
        error: "Not found",
        message: "Record not found",
      });
    }
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal server error";

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}




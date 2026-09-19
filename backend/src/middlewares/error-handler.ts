import env from "../config/env.js";
import { logger } from "../lib/logger.js";
import { ApiError } from "../utils/api-error.js";

import type { NextFunction, Request, Response } from "express";

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    const body: Record<string, unknown> = {
      success: false,
      message: err.message,
    };

    if (err.details) {
      body.details = err.details;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  logger.error("Unhandled error", {
    message: err.message,
    stack: err.stack,
    error: err,
  });

  const body: Record<string, unknown> = {
    success: false,
    message: "Something went wrong",
  };

  if (env.NODE_ENV === "development") {
    body.details = err.stack;
  }

  res.status(500).json(body);
}

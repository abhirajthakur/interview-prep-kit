import type { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { asyncLocalStorage } from "../lib/async-context.js";

export const correlationId = (req: Request, res: Response, next: NextFunction): void => {
  const correlationId = req.headers["x-correlation-id"]?.toString() ?? crypto.randomUUID();

  res.setHeader("x-correlation-id", correlationId);

  asyncLocalStorage.run({ correlationId }, () => next());
};

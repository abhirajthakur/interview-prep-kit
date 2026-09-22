import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";
import { badRequest } from "../utils/api-error.js";

// Schema shaped as { body?, params?, query? }. Reassigns req.body/params/query with the parsed values
export const validate =
  (schema: ZodType) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
    if (!result.success) {
      next(
        badRequest(
          "Invalid request",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
      return;
    }

    const parsed = result.data as { body?: unknown; params?: unknown; query?: unknown };
    if (parsed.body !== undefined) {
      req.body = parsed.body;
    }
    if (parsed.params !== undefined) {
      req.params = parsed.params as typeof req.params;
    }
    if (parsed.query !== undefined) {
      req.query = parsed.query as typeof req.query;
    }

    next();
  };

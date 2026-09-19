import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

type RequestPart = "body" | "query" | "params";

export const validate = (schema: ZodType, part: RequestPart = "body") => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        details: result.error.issues,
      });
    }

    const parsed = result.data;

    if (part === "query") {
      Object.defineProperty(req, "query", {
        value: parsed,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    } else if (part === "body") {
      req.body = parsed;
    } else {
      req.params = parsed as typeof req.params;
    }

    next();
  };
};

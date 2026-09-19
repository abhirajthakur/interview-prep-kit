import type { Response } from "express";

type SuccessPayload<T> = {
  success: true;
  data: T;
  message?: string;
};

export function sendSuccess<T>(res: Response, statusCode = 200, data: T, message?: string) {
  const payload: SuccessPayload<T> = {
    success: true,
    data,
  };

  if (message) {
    payload.message = message;
  }

  res.status(statusCode).json(payload);
}

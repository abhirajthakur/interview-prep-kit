import type { Request, Response } from "express";
import env from "../config/env.js";
import * as authService from "./auth.service.js";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "./session-token.js";
import { sendSuccess } from "../utils/api-response.js";

const isProd = env.NODE_ENV === "production";

function setSessionCookie(res: Response, raw: string) {
  res.cookie(SESSION_COOKIE_NAME, raw, sessionCookieOptions(isProd));
}

export async function register(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const { user, session } = await authService.register(email, password);
  setSessionCookie(res, session.raw);
  sendSuccess(res, 201, { success: true, data: { user } });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };
  const { user, session } = await authService.login(email, password);
  setSessionCookie(res, session.raw);
  sendSuccess(res, 200, { success: true, data: { user } });
}

export async function logout(req: Request, res: Response) {
  const raw = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (raw) await authService.logout(raw);
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  sendSuccess(res, 200, { success: true, data: null });
}

export function me(req: Request, res: Response) {
  sendSuccess(res, 200, { success: true, data: { user: req.user } });
}

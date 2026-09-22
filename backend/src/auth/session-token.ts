import { randomBytes, createHash } from "node:crypto";

const TOKEN_BYTES = 32;
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type NewSessionToken = { raw: string; hash: string; expiresAt: Date };

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Raw token goes in the cookie; only the hash is ever stored
export function createSessionToken(now: Date = new Date()): NewSessionToken {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  return { raw, hash: hashToken(raw), expiresAt: new Date(now.getTime() + SESSION_TTL_MS) };
}

export const SESSION_COOKIE_NAME = "session";

export function sessionCookieOptions(isProduction: boolean): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

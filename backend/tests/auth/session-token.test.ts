import { describe, expect, it } from "vitest";
import {
  createSessionToken,
  hashToken,
  sessionCookieOptions,
  SESSION_TTL_MS,
} from "../../src/auth/session-token.js";

describe("createSessionToken", () => {
  it("returns a raw token whose hash matches, and sets a 30-day expiry", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const token = createSessionToken(now);
    expect(token.hash).toBe(hashToken(token.raw));
    expect(token.expiresAt.getTime() - now.getTime()).toBe(SESSION_TTL_MS);
  });

  it("never generates the same raw token twice", () => {
    const seen = new Set(Array.from({ length: 50 }, () => createSessionToken().raw));
    expect(seen.size).toBe(50);
  });
});

describe("sessionCookieOptions", () => {
  it("only marks the cookie secure in production", () => {
    expect(sessionCookieOptions(false).secure).toBe(false);
    expect(sessionCookieOptions(true).secure).toBe(true);
  });

  it("is always httpOnly and sameSite lax", () => {
    const opts = sessionCookieOptions(true);
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe("lax");
  });
});

import { getUserFromToken } from "../auth/auth.service.js";
import { SESSION_COOKIE_NAME } from "../auth/session-token.js";
import { unauthorized } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const sessionCookie = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
  if (!sessionCookie) {
    throw unauthorized("Sign in required.");
  }

  const user = await getUserFromToken(sessionCookie);
  if (!user) {
    throw unauthorized("Session expired or invalid. Sign in again.");
  }

  req.user = user;
  next();
});

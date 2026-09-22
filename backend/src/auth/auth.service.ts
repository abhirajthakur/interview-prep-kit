import { conflict, unauthorized } from "../utils/api-error.js";
import { Session } from "../db/models/session.model.js";
import { User, type UserDoc } from "../db/models/user.model.js";
import { hashPassword, verifyPassword } from "./password.js";
import { createSessionToken, hashToken, type NewSessionToken } from "./session-token.js";

export type PublicUser = { id: string; email: string };

const toPublic = (user: UserDoc): PublicUser => ({ id: user.id as string, email: user.email });

export async function register(
  email: string,
  password: string,
): Promise<{ user: PublicUser; session: NewSessionToken }> {
  const passwordHash = await hashPassword(password);
  let user: UserDoc;
  try {
    user = await User.create({ email: email.toLowerCase().trim(), passwordHash });
  } catch (e) {
    if (e instanceof Error && "code" in e && (e as { code?: number }).code === 11000) {
      throw conflict("An account with this email already exists.");
    }
    throw e;
  }
  const session = await issueSession(user.id as string);
  return { user: toPublic(user), session };
}

export async function login(
  email: string,
  password: string,
): Promise<{ user: PublicUser; session: NewSessionToken }> {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Invalid email or password.");
  }
  const session = await issueSession(user.id as string);
  return { user: toPublic(user), session };
}

async function issueSession(userId: string): Promise<NewSessionToken> {
  const token = createSessionToken();
  await Session.create({ userId, tokenHash: token.hash, expiresAt: token.expiresAt });
  return token;
}

export async function logout(rawToken: string) {
  await Session.deleteOne({ tokenHash: hashToken(rawToken) });
}

export async function getUserFromToken(rawToken: string): Promise<PublicUser | null> {
  const session = await Session.findOne({ tokenHash: hashToken(rawToken) });
  if (!session || session.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const user = await User.findById(session.userId);
  return user ? toPublic(user) : null;
}

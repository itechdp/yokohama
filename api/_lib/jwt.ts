import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";

function secret(name: string): Uint8Array {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return new TextEncoder().encode(value);
}

const CHALLENGE_SECRET = () => secret("AUTH_CHALLENGE_SECRET");
const SESSION_SECRET = () => secret("AUTH_SESSION_SECRET");

export interface ChallengePayload {
  username: string;
  nonce: string;
}

export interface SessionUser {
  id: string;
  username: string;
  role: "admin" | "operator";
}

// Short-lived (60s) signed token proving "this login attempt is fresh" for a
// given username. Does not touch the DB (avoids leaking username existence).
export async function issueChallenge(username: string): Promise<string> {
  return new SignJWT({ username, nonce: randomUUID() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(CHALLENGE_SECRET());
}

export async function verifyChallenge(token: string): Promise<ChallengePayload> {
  const { payload } = await jwtVerify(token, CHALLENGE_SECRET(), {
    algorithms: ["HS256"],
  });
  const { username, nonce } = payload as Record<string, unknown>;
  if (typeof username !== "string" || typeof nonce !== "string") {
    throw new Error("Malformed challenge token");
  }
  return { username, nonce };
}

// Long-lived (30d) session token proving "this is an authenticated session".
// Separate secret from the challenge token - different trust domains.
export async function issueSession(user: SessionUser): Promise<string> {
  return new SignJWT({ username: user.username, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SESSION_SECRET());
}

export async function verifySession(token: string): Promise<SessionUser> {
  const { payload } = await jwtVerify(token, SESSION_SECRET(), {
    algorithms: ["HS256"],
  });
  const { sub, username, role } = payload as Record<string, unknown>;
  if (
    typeof sub !== "string" ||
    typeof username !== "string" ||
    (role !== "admin" && role !== "operator")
  ) {
    throw new Error("Malformed session token");
  }
  return { id: sub, username, role };
}

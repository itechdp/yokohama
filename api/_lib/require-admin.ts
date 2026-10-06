import type { VercelRequest, VercelResponse } from "@vercel/node";
import { verifySession, type SessionUser } from "./jwt.js";

// Parses the Authorization: Bearer <session jwt> header and requires role === "admin".
// On failure, writes the response itself and returns null - callers should
// `const admin = await requireAdmin(req, res); if (!admin) return;`
export async function requireAdmin(
  req: VercelRequest,
  res: VercelResponse
): Promise<SessionUser | null> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return null;
  }

  let user: SessionUser;
  try {
    user = await verifySession(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired session" });
    return null;
  }

  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }

  return user;
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { issueChallenge } from "../_lib/jwt.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username.trim()) {
    res.status(400).json({ error: "username is required" });
    return;
  }

  // Deliberately does not touch the DB - avoids leaking whether a username exists.
  const challenge_token = await issueChallenge(username.trim());
  res.status(200).json({ challenge_token });
}

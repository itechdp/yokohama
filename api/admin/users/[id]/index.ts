import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../../_lib/supabase-admin.js";
import { requireAdmin } from "../../../_lib/require-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  // No self-delete - deleting your own account while logged in would lock
  // you out with no way back in except raw SQL access.
  if (id === admin.id) {
    res.status(403).json({ error: "You cannot delete your own account. Ask another admin." });
    return;
  }

  const { error } = await supabaseAdmin.from("app_users").delete().eq("id", id);
  if (error) {
    res.status(500).json({ error: "Failed to delete user" });
    return;
  }

  res.status(200).json({ ok: true });
}

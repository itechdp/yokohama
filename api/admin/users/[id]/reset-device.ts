import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../../../_lib/supabase-admin.js";
import { requireAdmin } from "../../../_lib/require-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { id } = req.query;
  if (typeof id !== "string") {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const { error } = await supabaseAdmin
    .from("app_users")
    .update({
      device_public_key: null,
      device_registered_at: null,
      failed_login_attempts: 0,
      locked_until: null,
    })
    .eq("id", id);

  if (error) {
    res.status(500).json({ error: "Failed to reset device" });
    return;
  }

  res.status(200).json({ ok: true });
}

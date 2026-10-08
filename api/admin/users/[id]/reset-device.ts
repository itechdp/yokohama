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

  // No self-reset, for anyone - a device reset must always be traceable to
  // a *different* person, or the whole point of device binding (proving who
  // did what, from where) collapses.
  if (id === admin.id) {
    res.status(403).json({ error: "You cannot reset your own device. Ask another admin." });
    return;
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from("app_users")
    .select("id, username")
    .eq("id", id)
    .maybeSingle();

  if (targetError || !target) {
    res.status(404).json({ error: "User not found" });
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

  // Audit trail - who reset whose device, and when.
  const { error: logError } = await supabaseAdmin.from("device_reset_log").insert({
    reset_by_user_id: admin.id,
    reset_by_username: admin.username,
    target_user_id: target.id,
    target_username: target.username,
  });
  if (logError) {
    console.warn("device_reset_log insert failed:", logError.message);
  }

  res.status(200).json({ ok: true });
}

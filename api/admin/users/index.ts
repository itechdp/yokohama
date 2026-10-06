import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../../_lib/supabase-admin.js";
import { requireAdmin } from "../../_lib/require-admin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin
      .from("app_users")
      .select(
        "id, username, role, is_active, device_registered_at, created_at"
      )
      .order("created_at", { ascending: true });

    if (error) {
      res.status(500).json({ error: "Failed to list users" });
      return;
    }

    res.status(200).json({
      users: (data ?? []).map((u) => ({
        ...u,
        device_registered: Boolean(u.device_registered_at),
      })),
    });
    return;
  }

  if (req.method === "POST") {
    const { username, password, role } = req.body ?? {};

    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string" ||
      password.length < 8 ||
      (role !== "admin" && role !== "operator")
    ) {
      res.status(400).json({
        error:
          "username, role ('admin'|'operator'), and a password of at least 8 characters are required",
      });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);

    const { data, error } = await supabaseAdmin
      .from("app_users")
      .insert({ username: username.trim(), password_hash, role })
      .select("id, username, role, is_active, created_at")
      .single();

    if (error) {
      const isDuplicate = error.code === "23505";
      res
        .status(isDuplicate ? 409 : 500)
        .json({ error: isDuplicate ? "Username already exists" : "Failed to create user" });
      return;
    }

    res.status(201).json({ user: data });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}

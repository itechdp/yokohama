import type { VercelRequest, VercelResponse } from "@vercel/node";
import bcrypt from "bcryptjs";
import { supabaseAdmin } from "../_lib/supabase-admin.js";
import { verifyChallenge, issueSession } from "../_lib/jwt.js";
import { verifyDeviceSignature } from "../_lib/device-signature.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

const INVALID_CREDENTIALS = { error: "Invalid username or password" };
const DEVICE_NOT_REGISTERED = {
  error: "Device not registered. Contact an admin to reset your device.",
};

interface AppUserRow {
  id: string;
  username: string;
  password_hash: string;
  role: "admin" | "operator";
  device_public_key: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  is_active: boolean;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { username, password, challenge_token, signature_b64, device_public_key_b64 } =
    req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof challenge_token !== "string" ||
    typeof signature_b64 !== "string"
  ) {
    res.status(400).json({ error: "username, password, challenge_token, signature_b64 are required" });
    return;
  }

  // 1. Verify the challenge token itself (signature + exp) and that it was
  // issued for this username.
  let nonce: string;
  try {
    const challenge = await verifyChallenge(challenge_token);
    if (challenge.username.trim().toLowerCase() !== username.trim().toLowerCase()) {
      res.status(401).json(INVALID_CREDENTIALS);
      return;
    }
    nonce = challenge.nonce;
  } catch {
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  // 2. Single-use nonce check - a captured/replayed request reuses the same
  // challenge token and nonce, which fails this unique insert the second time.
  const { error: nonceError } = await supabaseAdmin.from("auth_nonces").insert({ nonce });
  if (nonceError) {
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  // 3. Look up the user.
  const { data: user, error: userError } = await supabaseAdmin
    .from("app_users")
    .select(
      "id, username, password_hash, role, device_public_key, failed_login_attempts, locked_until, is_active"
    )
    .ilike("username", username.trim())
    .maybeSingle<AppUserRow>();

  if (userError || !user || !user.is_active) {
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);

  const recordFailure = async () => {
    const attempts = user.failed_login_attempts + 1;
    const locked_until =
      attempts >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
        : null;
    await supabaseAdmin
      .from("app_users")
      .update({ failed_login_attempts: attempts, locked_until })
      .eq("id", user.id);
  };

  if (!passwordOk) {
    await recordFailure();
    res.status(401).json(INVALID_CREDENTIALS);
    return;
  }

  // 4. Device verification: challenge_token is the exact string the client
  // was asked to sign on-device.
  let deviceOk = false;
  let boundKey = user.device_public_key;

  if (!user.device_public_key) {
    // No device bound yet (fresh account or just reset by an admin) - trust-on-first-use.
    if (typeof device_public_key_b64 === "string" && device_public_key_b64) {
      deviceOk = verifyDeviceSignature(device_public_key_b64, signature_b64, challenge_token);
      if (deviceOk) {
        boundKey = device_public_key_b64;
      }
    }
  } else {
    // A key is already on file - never trust a client-submitted key once bound.
    deviceOk = verifyDeviceSignature(user.device_public_key, signature_b64, challenge_token);
  }

  if (!deviceOk) {
    await recordFailure();
    const wasAlreadyBound = Boolean(user.device_public_key);
    res.status(wasAlreadyBound ? 403 : 401).json(wasAlreadyBound ? DEVICE_NOT_REGISTERED : INVALID_CREDENTIALS);
    return;
  }

  // 5. Success - reset lockout state, persist the bound key if this was a first-time bind.
  await supabaseAdmin
    .from("app_users")
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      device_public_key: boundKey,
      device_registered_at: user.device_public_key ? undefined : new Date().toISOString(),
    })
    .eq("id", user.id);

  const session_jwt = await issueSession({ id: user.id, username: user.username, role: user.role });
  res.status(200).json({
    session_jwt,
    user: { id: user.id, username: user.username, role: user.role },
  });
}

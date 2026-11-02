// Request handlers for the three Edge Functions. They hold ALL the logic and talk to
// Supabase only through the small interfaces below, so they can be unit-tested with fakes
// (tests/user-management) and wired to the real clients in runtime.ts.
//
// Security model:
//   * Who is calling is decided by the verified Supabase Auth token, never by the body.
//   * Every privileged action is first authorised by the database (app_authorize_manage,
//     which uses the caller's own session), and only then performed with the service key.
//   * The database re-checks the same rules in the service-only functions it exposes.
//   * Failed sign-ins answer with one generic message, and are rate limited per username
//     and per address.

import {
  LOGIN_FAILED,
  LOGIN_LOCKED,
  isModuleKey,
  passwordProblem,
  syntheticEmail,
  usernameProblem,
} from "./policy.ts";

export interface DbError {
  message: string;
}
export interface SessionLike {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  token_type: string;
}
export interface DbClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: DbError | null }>;
  auth: {
    getUser(token: string): PromiseLike<{ data: { user: { id: string; email?: string | null } | null }; error: unknown }>;
    signInWithPassword(c: { email: string; password: string }): PromiseLike<{ data: { session: SessionLike | null }; error: unknown }>;
    admin: {
      createUser(a: Record<string, unknown>): PromiseLike<{ data: { user: { id: string } | null }; error: DbError | null }>;
      updateUserById(id: string, a: Record<string, unknown>): PromiseLike<{ error: DbError | null }>;
      deleteUser(id: string): PromiseLike<{ error: DbError | null }>;
    };
  };
}

export interface Deps {
  /** Service-role client: bypasses RLS. Never reachable from the browser. */
  svc: DbClient;
  /** Fresh anon client with no session (used to verify a password). */
  anon: () => DbClient;
  /** Client acting as the caller, so database functions see the caller's own session. */
  asUser: (token: string) => DbClient;
  newId: () => string;
}

export interface Req {
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export interface Res {
  status: number;
  body: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const reply = (status: number, body: Record<string, unknown>): Res => ({ status, body });
const fail = (status: number, error: string): Res => reply(status, { error });

async function readBody(req: Req): Promise<Record<string, unknown> | null> {
  try {
    const b = await req.json();
    return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clientIp(req: Req): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim().slice(0, 100);
}

function bearer(req: Req): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "");
  return m ? m[1].trim() : null;
}

/** Reads a claim from a JWT the caller has ALREADY been verified with (getUser validated it). */
export function jwtClaim(token: string, claim: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
    return typeof json[claim] === "string" ? json[claim] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sign in (username + password) with brute-force lockout
// ---------------------------------------------------------------------------
export async function handleLogin(req: Req, deps: Deps): Promise<Res> {
  const body = await readBody(req);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password || username.length > 64 || password.length > 200) {
    return fail(400, "Username and password are required");
  }
  const ip = clientIp(req);

  const check = await deps.svc.rpc("app_login_check", { p_username: username, p_ip: ip });
  const state = asRecord(check.data);
  if (check.error || !state) return fail(503, "Sign-in is temporarily unavailable");
  if (state.locked) return fail(429, LOGIN_LOCKED);

  const userId = typeof state.user_id === "string" ? state.user_id : null;
  const known = Boolean(userId) && state.active === true;

  // Unknown, deactivated and wrong-password all look identical, including timing.
  const email = known ? syntheticEmail(userId as string) : syntheticEmail(deps.newId());
  const { data, error } = await deps.anon().auth.signInWithPassword({ email, password });

  if (!known || error || !data?.session) {
    await deps.svc.rpc("app_login_record", { p_username: username, p_ip: ip, p_success: false, p_user_id: userId });
    return fail(401, LOGIN_FAILED);
  }

  await deps.svc.rpc("app_login_record", { p_username: username, p_ip: ip, p_success: true, p_user_id: userId });
  const s = data.session;
  return reply(200, {
    session: {
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in,
      expires_at: s.expires_at,
      token_type: s.token_type,
    },
  });
}

// ---------------------------------------------------------------------------
// Change own password (current password required) - SUPER ADMIN ONLY.
// Admins and Operators always use the password an authorised administrator set for them;
// the role comes from the database (app_me), never from the request.
// ---------------------------------------------------------------------------
export async function handleChangePassword(req: Req, deps: Deps): Promise<Res> {
  const token = bearer(req);
  if (!token) return fail(401, "Not signed in");
  const who = await deps.svc.auth.getUser(token);
  const authUser = who.data?.user;
  if (who.error || !authUser?.email) return fail(401, "Not signed in");

  const me = await deps.asUser(token).rpc("app_me");
  const profile = Array.isArray(me.data) ? asRecord(me.data[0]) : null;
  if (me.error || !profile || typeof profile.username !== "string") return fail(401, "Not signed in");
  const username = profile.username;
  if (profile.role !== "super_admin") return fail(403, "Not allowed");

  const body = await readBody(req);
  const current = typeof body?.current_password === "string" ? body.current_password : "";
  const next = typeof body?.new_password === "string" ? body.new_password : "";
  if (!current || !next) return fail(400, "Current and new password are required");
  const problem = passwordProblem(next, username);
  if (problem) return fail(400, problem);
  if (next === current) return fail(400, "New password must be different from the current one");

  const ip = clientIp(req);
  const check = await deps.svc.rpc("app_login_check", { p_username: username, p_ip: ip });
  const state = asRecord(check.data);
  if (check.error || !state) return fail(503, "Password change is temporarily unavailable");
  if (state.locked) return fail(429, LOGIN_LOCKED);

  const verify = await deps.anon().auth.signInWithPassword({ email: authUser.email, password: current });
  if (verify.error || !verify.data?.session) {
    await deps.svc.rpc("app_login_record", { p_username: username, p_ip: ip, p_success: false, p_user_id: authUser.id });
    return fail(401, "Current password is incorrect");
  }

  const upd = await deps.svc.auth.admin.updateUserById(authUser.id, { password: next });
  if (upd.error) return fail(500, "Could not change the password");

  await deps.svc.rpc("app_after_password_change", {
    p_user_id: authUser.id,
    p_keep_session: jwtClaim(token, "session_id"),
  });
  return reply(200, { ok: true });
}

// ---------------------------------------------------------------------------
// User administration: create, reset password, delete
// ---------------------------------------------------------------------------
export async function handleAdminUsers(req: Req, deps: Deps): Promise<Res> {
  const token = bearer(req);
  if (!token) return fail(401, "Not signed in");
  const who = await deps.svc.auth.getUser(token);
  if (who.error || !who.data?.user) return fail(401, "Not signed in");

  const body = await readBody(req);
  if (!body) return fail(400, "Invalid request");
  const action = body.action;
  const asCaller = deps.asUser(token);

  const authorize = async (a: string, target: string | null, role: string | null) => {
    const r = await asCaller.rpc("app_authorize_manage", { p_action: a, p_target: target, p_role: role });
    const rec = asRecord(r.data);
    return r.error || !rec ? null : (rec as Record<string, string>);
  };

  if (action === "create_user") {
    const role = body.role;
    if (role !== "operator" && role !== "admin") return fail(400, "Invalid role");
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const modules = Array.isArray(body.modules) ? body.modules : [];
    const uProblem = usernameProblem(username);
    if (uProblem) return fail(400, uProblem);
    const pProblem = passwordProblem(password, username);
    if (pProblem) return fail(400, pProblem);
    if (!modules.every(isModuleKey)) return fail(400, "Unknown module");

    const auth = await authorize("create", null, role);
    if (!auth) return fail(403, "Not allowed");

    const wantedId = deps.newId();
    const created = await deps.svc.auth.admin.createUser({
      id: wantedId,
      email: syntheticEmail(wantedId),
      password,
      email_confirm: true,
    });
    const newUser = created.data?.user;
    if (created.error || !newUser) return fail(400, "Could not create the user");
    if (newUser.id !== wantedId) {
      // Auth chose its own id: make the login address match it.
      await deps.svc.auth.admin.updateUserById(newUser.id, { email: syntheticEmail(newUser.id) });
    }

    const reg = await deps.svc.rpc("app_register_profile", {
      p_id: newUser.id,
      p_username: username,
      p_role: role,
      p_modules: role === "operator" ? modules : [],
      p_created_by: auth.actor_id,
    });
    if (reg.error) {
      await deps.svc.auth.admin.deleteUser(newUser.id); // undo: no half-created account
      const m = reg.error.message ?? "";
      if (/duplicate|already exists/i.test(m)) return fail(409, "Username already exists");
      if (/Username must be/i.test(m)) return fail(400, m);
      return fail(400, "Could not create the user");
    }
    return reply(200, { ok: true, id: newUser.id });
  }

  if (action === "reset_password") {
    const target = typeof body.target_id === "string" && UUID.test(body.target_id) ? body.target_id : null;
    const password = typeof body.new_password === "string" ? body.new_password : "";
    if (!target) return fail(400, "Invalid request");
    const auth = await authorize("reset_password", target, null);
    if (!auth) return fail(403, "Not allowed");
    const problem = passwordProblem(password, auth.target_username);
    if (problem) return fail(400, problem);

    const upd = await deps.svc.auth.admin.updateUserById(target, { password });
    if (upd.error) return fail(500, "Could not reset the password");
    const done = await deps.svc.rpc("app_after_password_reset", { p_actor: auth.actor_id, p_target: target });
    if (done.error) return fail(500, "Password was reset but the follow-up failed");
    return reply(200, { ok: true });
  }

  if (action === "delete_user") {
    const target = typeof body.target_id === "string" && UUID.test(body.target_id) ? body.target_id : null;
    if (!target) return fail(400, "Invalid request");
    const auth = await authorize("delete", target, null);
    if (!auth) return fail(403, "Not allowed");

    const del = await deps.svc.auth.admin.deleteUser(target);
    if (del.error && !/not.?found/i.test(del.error.message ?? "")) return fail(500, "Could not delete the user");
    const done = await deps.svc.rpc("app_finalize_delete", { p_actor: auth.actor_id, p_target: target });
    if (done.error) return fail(500, "Could not finish deleting the user");
    return reply(200, { ok: true });
  }

  return fail(400, "Unknown action");
}

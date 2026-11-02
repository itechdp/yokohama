import { supabase } from "@/lib/supabase";
import { isModuleKey, type ModuleKey, type Role } from "@/lib/user-policy";

// Sign-in and user management use Supabase Auth plus the database functions in
// supabase/migrations/rbac_0*.sql and the Edge Functions in supabase/functions.
// The browser never decides who someone is or what they may do: the server reads the
// signed-in session and refuses anything outside the person's role and modules.

export interface SessionUser {
  id: string;
  username: string;
  role: Role;
  modules: ModuleKey[];
}

export interface UserRow {
  id: string;
  username: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  modules: ModuleKey[];
}

export interface AuditRow {
  at: string;
  actorUsername: string | null;
  action: string;
  targetUsername: string | null;
  details: Record<string, unknown>;
}

export type MeResult =
  | { status: "ok"; user: SessionUser }
  | { status: "none" } // no valid session / deactivated / deleted: sign out
  | { status: "error" }; // could not reach the server: keep the person signed in

const asModules = (v: unknown): ModuleKey[] => (Array.isArray(v) ? v.filter(isModuleKey) : []);

interface MeRow {
  id: string;
  username: string;
  role: Role;
  modules: string[] | null;
}

// Edge Function errors arrive as a failed HTTP response; pull the server's message out.
async function functionError(error: unknown): Promise<string> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (ctx instanceof Response) {
    try {
      const body = (await ctx.json()) as { error?: string };
      if (body?.error) return body.error;
    } catch {
      // fall through
    }
  }
  return "Something went wrong. Check your connection and try again.";
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw new Error(await functionError(error));
  return data as T;
}

export async function fetchMe(): Promise<MeResult> {
  const { data, error, status } = await supabase.rpc("app_me");
  if (error) {
    const authProblem = status === 401 || status === 403 || error.code === "PGRST301" || /JWT/i.test(error.message);
    return authProblem ? { status: "none" } : { status: "error" };
  }
  const row = (data as MeRow[] | null)?.[0];
  if (!row) return { status: "none" };
  return {
    status: "ok",
    user: {
      id: row.id,
      username: row.username,
      role: row.role,
      modules: asModules(row.modules),
    },
  };
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const res = await callFunction<{ session?: { access_token: string; refresh_token: string } }>("auth-login", {
    username,
    password,
  });
  if (!res?.session) throw new Error("Invalid username or password");
  const { error } = await supabase.auth.setSession({
    access_token: res.session.access_token,
    refresh_token: res.session.refresh_token,
  });
  if (error) throw new Error("Could not start your session. Try again.");
  const me = await fetchMe();
  if (me.status !== "ok") {
    await supabase.auth.signOut();
    throw new Error("This account is not active. Contact your administrator.");
  }
  return me.user;
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut();
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await callFunction("change-password", { current_password: currentPassword, new_password: newPassword });
}

// ---- user management (Admin / Super Admin; the server re-checks every call) ----

interface UserRpcRow {
  id: string;
  username: string;
  role: Role;
  is_active: boolean;
  created_at: string;
  modules: string[] | null;
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = (await rpc<UserRpcRow[] | null>("app_list_users")) ?? [];
  return rows.map((r) => ({
    id: r.id,
    username: r.username,
    role: r.role,
    isActive: r.is_active,
    createdAt: r.created_at,
    modules: asModules(r.modules),
  }));
}

export async function listAudit(limit = 100): Promise<AuditRow[]> {
  const rows =
    (await rpc<
      { at: string; actor_username: string | null; action: string; target_username: string | null; details: Record<string, unknown> }[] | null
    >("app_list_audit", { p_limit: limit })) ?? [];
  return rows.map((r) => ({
    at: r.at,
    actorUsername: r.actor_username,
    action: r.action,
    targetUsername: r.target_username,
    details: r.details ?? {},
  }));
}

export async function createUser(params: {
  username: string;
  password: string;
  role: Exclude<Role, "super_admin">;
  modules: ModuleKey[];
}): Promise<void> {
  await callFunction("admin-users", { action: "create_user", ...params });
}

export async function resetUserPassword(targetId: string, newPassword: string): Promise<void> {
  await callFunction("admin-users", { action: "reset_password", target_id: targetId, new_password: newPassword });
}

export async function deleteUser(targetId: string): Promise<void> {
  await callFunction("admin-users", { action: "delete_user", target_id: targetId });
}

export async function renameUser(userId: string, username: string): Promise<void> {
  await rpc("app_rename_user", { p_user_id: userId, p_new_username: username });
}

export async function setUserModules(userId: string, modules: ModuleKey[]): Promise<void> {
  await rpc("app_set_user_modules", { p_user_id: userId, p_modules: modules });
}

export async function setUserActive(userId: string, active: boolean): Promise<void> {
  await rpc("app_set_user_active", { p_user_id: userId, p_active: active });
}

export async function setUserRole(userId: string, role: Exclude<Role, "super_admin">): Promise<void> {
  await rpc("app_set_user_role", { p_user_id: userId, p_role: role });
}

import { supabase } from "@/lib/supabase";

// Login and user management go through the database functions in
// supabase/migrations/users.sql - no Supabase Auth, no API server, no tokens.

export type UserRole = "admin" | "operator";

export interface SessionUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface UserRow {
  id: string;
  username: string;
  role: UserRole;
  created_at: string;
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const { data, error } = await supabase.rpc("app_login", {
    p_username: username,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  const user = (data as SessionUser[] | null)?.[0];
  if (!user) throw new Error("Invalid username or password");
  return user;
}

export async function listUsers(adminId: string): Promise<UserRow[]> {
  const { data, error } = await supabase.rpc("app_list_users", { p_admin_id: adminId });
  if (error) throw new Error(error.message);
  return (data as UserRow[] | null) ?? [];
}

export async function createUser(
  adminId: string,
  params: { username: string; password: string; role: UserRole }
): Promise<void> {
  const { error } = await supabase.rpc("app_create_user", {
    p_admin_id: adminId,
    p_username: params.username,
    p_password: params.password,
    p_role: params.role,
  });
  if (error) throw new Error(error.message);
}

export async function deleteUser(adminId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("app_delete_user", {
    p_admin_id: adminId,
    p_user_id: userId,
  });
  if (error) throw new Error(error.message);
}

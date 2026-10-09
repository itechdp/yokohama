import { supabase } from "@/lib/supabase";

// Shared PIN that gates the operator Exit button - see
// supabase/migrations/exit_pin_setting.sql. Same anon-key RPC pattern as
// auth-client.ts (no API server, no tokens).

export async function verifyExitPin(pin: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("app_verify_exit_pin", { p_pin: pin });
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getExitPin(adminId: string): Promise<string> {
  const { data, error } = await supabase.rpc("app_get_exit_pin", { p_admin_id: adminId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? "";
}

export async function setExitPin(adminId: string, pin: string): Promise<void> {
  const { error } = await supabase.rpc("app_set_exit_pin", { p_admin_id: adminId, p_pin: pin });
  if (error) throw new Error(error.message);
}

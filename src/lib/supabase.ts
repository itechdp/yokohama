import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Set them in .env.local (see .env.example)."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Row shape for the public.tire_skus table (see supabase/schema.sql).
export interface TireSkuRow {
  id: number;
  material: string;
  description: string;
  ply_rating_bottom: string | null;
  brand: string | null;
  created_at: string;
  updated_at: string;
}

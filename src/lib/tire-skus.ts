import { supabase, type TireSkuRow } from "@/lib/supabase";
import type { CatalogRow } from "@/lib/tire-catalog";

export interface TireSkuPage {
  rows: TireSkuRow[];
  count: number;
}

// One page of the "Show tire" catalog, optionally filtered by material/description.
// Server-side paginated (via Supabase .range()) since the table can hold thousands
// of rows — nothing paginated client-side would scale to that.
export async function fetchTireSkusPage(params: {
  query?: string;
  page: number;
  pageSize: number;
}): Promise<TireSkuPage> {
  const { query, page, pageSize } = params;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let request = supabase
    .from("tire_skus")
    .select("*", { count: "exact" })
    .order("material", { ascending: true })
    .range(from, to);

  const q = query?.trim();
  if (q) {
    request = request.or(`material.ilike.%${q}%,description.ilike.%${q}%`);
  }

  const { data, error, count } = await request;
  if (error) {
    console.warn("tire_skus page fetch failed:", error.message);
    return { rows: [], count: 0 };
  }
  return { rows: data ?? [], count: count ?? 0 };
}

// Exact Material lookup — used by the "Scan tire QR" flow, where the code
// printed on a tire encodes its Material value and has to resolve to exactly
// one SKU (unlike the fuzzy ilike search used for the autocomplete).
export async function fetchTireSkuByMaterial(material: string): Promise<TireSkuRow | null> {
  const m = material.trim();
  if (!m) return null;

  const { data, error } = await supabase
    .from("tire_skus")
    .select("*")
    .ilike("material", m)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("tire_skus material lookup failed:", error.message);
    return null;
  }
  return data ?? null;
}

// Looks up SKUs by material/description for the Add Tire autocomplete.
export async function searchTireSkus(query: string, limit = 8): Promise<TireSkuRow[]> {
  const q = query.trim();
  if (!q) return [];

  const { data, error } = await supabase
    .from("tire_skus")
    .select("*")
    .or(`material.ilike.%${q}%,description.ilike.%${q}%`)
    .order("material", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("tire_skus search failed:", error.message);
    return [];
  }
  return data ?? [];
}

// Records SKUs into the catalog (Add Tire / Bulk upload), keyed on Material so
// the same SKU never ends up as two rows: re-uploading a known Material
// overwrites its description/ply/brand instead of inserting a duplicate.
// Requires the unique index on tire_skus(material) from supabase/schema.sql.
export async function upsertTireSkus(rows: CatalogRow[]): Promise<{ error: string | null }> {
  const byMaterial = new Map<string, CatalogRow>();
  for (const r of rows) {
    if (!r.material) continue;
    byMaterial.set(r.material, r); // last occurrence in the batch wins
  }
  if (byMaterial.size === 0) return { error: null };

  const { error } = await supabase.from("tire_skus").upsert(
    Array.from(byMaterial.values()).map((r) => ({
      material: r.material,
      description: r.description,
      ply_rating_bottom: r.plyRatingBottom || null,
      brand: r.brand || null,
    })),
    { onConflict: "material" }
  );

  if (error) {
    console.warn("tire_skus upsert failed:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

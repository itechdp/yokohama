import { supabase, type TireSkuRow } from "@/lib/supabase";
import type { CatalogRow } from "@/lib/tire-catalog";

// Full (capped) list of SKUs for the "Show tire" catalog page.
export async function listTireSkus(limit = 500): Promise<TireSkuRow[]> {
  const { data, error } = await supabase
    .from("tire_skus")
    .select("*")
    .order("material", { ascending: true })
    .limit(limit);

  if (error) {
    console.warn("tire_skus list failed:", error.message);
    return [];
  }
  return data ?? [];
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

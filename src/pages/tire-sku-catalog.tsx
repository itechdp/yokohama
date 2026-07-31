import { useEffect, useState } from "react";
import { Link } from "react-router";
import { List, Plus, Search } from "lucide-react";
import { listTireSkus, searchTireSkus } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";

export default function TireSkuCatalog() {
  const [rows, setRows] = useState<TireSkuRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = search.trim();
    const load = query ? searchTireSkus(query, 500) : listTireSkus();
    const timeout = setTimeout(() => {
      load.then((data) => {
        setRows(data);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <List className="size-6 text-primary" />
            Tires
          </h1>
          <p className="text-muted-foreground">
            Material, Description, Ply Rating Bottom and Brand stored in Supabase (tire_skus).
          </p>
        </div>
        <Link
          to="/tires/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="size-4" />
          Add tire
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by material or description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Material</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tire Description-Brand</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Ply Rating Bottom</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brand</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{row.material}</td>
                <td className="px-4 py-3 text-foreground">{row.description}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.ply_rating_bottom || "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.brand || "—"}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  No tires found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

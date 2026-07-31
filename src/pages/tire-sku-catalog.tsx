import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight, List, Plus, Search } from "lucide-react";
import { fetchTireSkusPage } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";

const PAGE_SIZE = 25;

export default function TireSkuCatalog() {
  const [rows, setRows] = useState<TireSkuRow[]>([]);
  const [count, setCount] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  // Any new search starts back at page 1.
  useEffect(() => {
    setPage(0);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      fetchTireSkusPage({ query: search, page, pageSize: PAGE_SIZE }).then(({ rows, count }) => {
        setRows(rows);
        setCount(count);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [search, page]);

  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const rangeStart = count === 0 ? 0 : page * PAGE_SIZE + 1;
  const rangeEnd = Math.min(count, (page + 1) * PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-4">
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

      {/* Mobile: stacked cards */}
      <div className="sm:hidden space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="font-semibold text-foreground">{row.material}</span>
              {row.brand && (
                <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                  {row.brand}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground">{row.description}</p>
            {row.ply_rating_bottom && (
              <p className="text-xs text-muted-foreground">Ply Rating Bottom: {row.ply_rating_bottom}</p>
            )}
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No tires found.
          </div>
        )}
      </div>

      {/* Desktop / tablet: table */}
      <div className="hidden sm:block rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
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

      {count > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {rangeStart}–{rangeEnd} of {count}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="size-4" />
              Prev
            </button>
            <span className="text-xs text-muted-foreground px-1">
              Page {page + 1} of {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTireSkusPage, searchTireSkus } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";

// Shared by Inward and Outward's "pick a tire type" step. Always shows
// something: the first page of the catalog when there's no query, filtered
// results once the operator types. No focus/blur dance — the list is a
// normal part of the page, not a dropdown you have to summon.
export default function TireCatalogSearch({
  alreadySelected,
  onSelect,
}: {
  alreadySelected: string[];
  onSelect: (sku: TireSkuRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TireSkuRow[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    const id = ++requestId.current;
    const timeout = setTimeout(() => {
      const request = q ? searchTireSkus(q, 20) : fetchTireSkusPage({ page: 0, pageSize: 20 }).then((p) => p.rows);
      request.then((rows) => {
        if (requestId.current === id) setResults(rows);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tire catalog by material or description"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {results.length === 0 ? (
          <li className="px-3 py-4 text-center text-xs text-muted-foreground">No matches.</li>
        ) : (
          results.map((sku) => {
            const isSelected = alreadySelected.includes(sku.material);
            return (
              <li key={sku.id}>
                <button
                  type="button"
                  disabled={isSelected}
                  onClick={() => onSelect(sku)}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors",
                    isSelected ? "cursor-not-allowed opacity-40" : "hover:bg-muted",
                  )}
                >
                  <div className="font-medium text-foreground">{sku.material}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {sku.description}
                    {isSelected ? " — already added" : ""}
                  </div>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, ClipboardList, Plus, Trash2 } from "lucide-react";
import { addPlanPendingTire, deletePlanPendingTire, fetchPlanPendingTires } from "@/lib/plan-pending-tires";
import { fetchTireSkusPage } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";
import type { PlanPendingTire } from "@/types/tire";

export default function PendingTyreDetail() {
  const { planNo = "" } = useParams<{ planNo: string }>();
  const [entries, setEntries] = useState<PlanPendingTire[]>([]);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    fetchPlanPendingTires().then((all) => setEntries(all.filter((t) => t.planNo === planNo)));
  }, [planNo]);

  const total = entries.reduce((sum, t) => sum + t.qty, 0);

  const handleAdd = async (tire: string, qty: number) => {
    const { row } = await addPlanPendingTire(planNo, tire, qty);
    if (row) setEntries((prev) => [...prev, row]);
    setShowForm(false);
  };

  const handleDelete = async (id: number) => {
    setEntries((prev) => prev.filter((t) => t.id !== id));
    await deletePlanPendingTire(id);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link
        to="/bays/pending"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Pending Tyre by Plan
      </Link>

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <ClipboardList className="size-6 text-primary" />
          Plan {planNo}
        </h1>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-primary p-2 text-white transition-colors hover:bg-primary/90"
          aria-label="Add pending tyre"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        {total > 0 ? `${total} tyre pending` : "No tyre pending"}
      </p>

      {showForm && <AddPendingTireForm onSubmit={handleAdd} onCancel={() => setShowForm(false)} />}

      {entries.length > 0 && (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3"
            >
              <span className="truncate text-sm text-foreground">{entry.tire || "—"}</span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-medium text-foreground">Qty {entry.qty}</span>
                <button
                  type="button"
                  onClick={() => handleDelete(entry.id)}
                  className="text-muted-foreground hover:text-danger"
                  aria-label="Remove pending tyre"
                >
                  <Trash2 className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AddPendingTireForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (tire: string, qty: number) => void;
  onCancel: () => void;
}) {
  const SUGGESTIONS_PAGE_SIZE = 30;

  const [tire, setTire] = useState("");
  const [qty, setQty] = useState("");
  const [suggestions, setSuggestions] = useState<TireSkuRow[]>([]);
  const [suggestionsTotal, setSuggestionsTotal] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const requestId = useRef(0);

  // Reset to page 0 of the full catalog (not just an 8-row preview) whenever
  // the query changes, so scrolling the dropdown can reach every SKU.
  useEffect(() => {
    const query = tire.trim();
    const id = ++requestId.current;
    const timeout = setTimeout(() => {
      fetchTireSkusPage({ query: query || undefined, page: 0, pageSize: SUGGESTIONS_PAGE_SIZE }).then(
        ({ rows, count }) => {
          if (requestId.current !== id) return;
          setSuggestions(rows);
          setSuggestionsTotal(count);
        },
      );
    }, 250);
    return () => clearTimeout(timeout);
  }, [tire]);

  const loadMoreSuggestions = () => {
    if (suggestions.length >= suggestionsTotal) return;
    const query = tire.trim();
    const id = requestId.current;
    const nextPage = Math.floor(suggestions.length / SUGGESTIONS_PAGE_SIZE);
    fetchTireSkusPage({ query: query || undefined, page: nextPage, pageSize: SUGGESTIONS_PAGE_SIZE }).then(
      ({ rows }) => {
        if (requestId.current !== id) return;
        setSuggestions((prev) => [...prev, ...rows]);
      },
    );
  };

  const handleSuggestionsScroll = (e: React.UIEvent<HTMLUListElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) {
      loadMoreSuggestions();
    }
  };

  const handleSubmit = () => {
    const trimmedTire = tire.trim();
    const qtyNum = Number(qty) || 0;
    if (!trimmedTire || qtyNum <= 0) return;
    onSubmit(trimmedTire, qtyNum);
    setTire("");
    setQty("");
  };

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <div className="relative">
        <input
          type="text"
          value={tire}
          onChange={(e) => {
            setTire(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          placeholder="Search tire"
          autoComplete="off"
          className="w-full rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {showSuggestions && suggestions.length > 0 && (
          <ul
            onScroll={handleSuggestionsScroll}
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
          >
            {suggestions.map((sku) => (
              <li key={sku.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setTire(sku.material);
                    setShowSuggestions(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                >
                  <div className="font-medium text-foreground">{sku.material}</div>
                  <div className="text-xs text-muted-foreground truncate">{sku.description}</div>
                </button>
              </li>
            ))}
            {suggestions.length < suggestionsTotal && (
              <li className="px-3 py-2 text-center text-xs text-muted-foreground">Scroll for more…</li>
            )}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
          placeholder="Qty"
          className="w-24 rounded-lg border border-border bg-transparent px-3 py-2 text-center text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleSubmit}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

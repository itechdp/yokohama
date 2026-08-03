import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Filter, LayoutGrid, Search } from "lucide-react";
import { fetchBayBookings, upsertBayBooking } from "@/lib/bay-bookings";
import { fetchTireSkusPage, searchTireSkus } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { BAY_COUNT, BAY_STATUS_LABELS, type BayBooking, type BayStatus } from "@/types/tire";

const STATUS_PILL_STYLES: Record<BayStatus, string> = {
  closed: "bg-success text-white",
  running: "bg-warning text-white",
  hold: "bg-danger text-white",
  "qc-pending": "bg-info text-white",
};

const STATUS_DOT_STYLES: Record<BayStatus, string> = {
  closed: "bg-success",
  running: "bg-warning",
  hold: "bg-danger",
  "qc-pending": "bg-info",
};

const STATUS_ROW_STYLES: Record<BayStatus, string> = {
  closed: "hover:bg-success-soft",
  running: "hover:bg-warning-soft",
  hold: "hover:bg-danger-soft",
  "qc-pending": "hover:bg-info-soft",
};

const STATUS_FILTER_STYLES: Record<BayStatus, string> = {
  closed: "bg-success text-white",
  running: "bg-warning text-white",
  hold: "bg-danger text-white",
  "qc-pending": "bg-info text-white",
};

type StatusFilter = BayStatus | "all";

function emptyRow(bay: number): BayBooking {
  return { bay, pendingTire: "", planNo: "", status: "running", qty: 0, updatedAt: new Date().toISOString() };
}

export default function BayBooking() {
  const [rows, setRows] = useState<BayBooking[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const saveTimeouts = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetchBayBookings().then((saved) => {
      const byBay = new Map(saved.map((r) => [r.bay, r]));
      const filled = Array.from({ length: BAY_COUNT }, (_, i) => byBay.get(i + 1) || emptyRow(i + 1));
      setRows(filled);
    });
  }, []);

  const updateRow = (bay: number, patch: Partial<BayBooking>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.bay === bay ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r));
      const updatedRow = next.find((r) => r.bay === bay);
      if (updatedRow) {
        clearTimeout(saveTimeouts.current[bay]);
        saveTimeouts.current[bay] = setTimeout(() => upsertBayBooking(updatedRow), 400);
      }
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        String(r.bay).includes(q) ||
        r.pendingTire.toLowerCase().includes(q) ||
        r.planNo.toLowerCase().includes(q)
      );
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <LayoutGrid className="size-6 text-primary" />
        Loading Bay
      </h1>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by bay, tire, or plan no"
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <FilterDropdown value={statusFilter} onChange={setStatusFilter} />
      </div>

      {filteredRows.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No bays match your search.
        </div>
      ) : (
        <div className="border border-border">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-8" />
              <col />
              <col className="w-[22%]" />
              <col className="w-[24%]" />
              <col className="w-11" />
            </colgroup>
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-1 py-1.5 text-center font-medium text-muted-foreground">
                  Bay
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left font-medium text-muted-foreground">
                  Tire
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left font-medium text-muted-foreground">
                  Plan
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left font-medium text-muted-foreground">
                  Status
                </th>
                <th className="border border-border px-1 py-1.5 text-center font-medium text-muted-foreground">
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.bay} className="bg-card even:bg-muted/30 hover:bg-muted/50 transition-colors">
                  <td className="border border-border px-1 py-1 text-center font-semibold text-foreground">
                    {row.bay}
                  </td>
                  <td className="border border-border p-0">
                    <PendingTireCell
                      value={row.pendingTire}
                      onChange={(pendingTire) => updateRow(row.bay, { pendingTire })}
                    />
                  </td>
                  <td className="border border-border p-0">
                    <input
                      type="text"
                      value={row.planNo}
                      onChange={(e) => updateRow(row.bay, { planNo: e.target.value })}
                      placeholder="—"
                      className="w-full bg-transparent px-1.5 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                    />
                  </td>
                  <td className="border border-border p-1">
                    <StatusDropdown value={row.status} onChange={(status) => updateRow(row.bay, { status })} />
                  </td>
                  <td className="border border-border p-0">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={row.qty === 0 ? "" : row.qty}
                      onChange={(e) =>
                        updateRow(row.bay, { qty: e.target.value === "" ? 0 : Number(e.target.value.replace(/\D/g, "")) || 0 })
                      }
                      placeholder="0"
                      className="w-full bg-transparent px-1 py-1.5 text-center text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusDropdown({ value, onChange }: { value: BayStatus; onChange: (status: BayStatus) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex w-full items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-medium focus:outline-none",
          STATUS_PILL_STYLES[value],
        )}
      >
        <span className="truncate">{BAY_STATUS_LABELS[value]}</span>
        <ChevronDown className="size-3 shrink-0" />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 w-32 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
          {(Object.keys(BAY_STATUS_LABELS) as BayStatus[]).map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors",
                  STATUS_ROW_STYLES[s],
                )}
              >
                <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_STYLES[s])} />
                {BAY_STATUS_LABELS[s]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterDropdown({ value, onChange }: { value: StatusFilter; onChange: (status: StatusFilter) => void }) {
  const [open, setOpen] = useState(false);
  const options: StatusFilter[] = ["all", ...(Object.keys(BAY_STATUS_LABELS) as BayStatus[])];
  const label = value === "all" ? "All" : BAY_STATUS_LABELS[value];

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition-colors focus:outline-none",
          value === "all"
            ? "border-border bg-card text-foreground hover:bg-muted"
            : cn("border-transparent", STATUS_FILTER_STYLES[value]),
        )}
      >
        <Filter className="size-4" />
        {label}
        <ChevronDown className="size-4" />
      </button>
      {open && (
        <ul className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-lg">
          {options.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors",
                  s === "all" ? "hover:bg-muted" : STATUS_ROW_STYLES[s],
                  value === s && "bg-muted",
                )}
              >
                {s === "all" ? (
                  <span className="size-2 shrink-0 rounded-full bg-muted-foreground/40" />
                ) : (
                  <span className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_STYLES[s])} />
                )}
                {s === "all" ? "All" : BAY_STATUS_LABELS[s]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PendingTireCell({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [suggestions, setSuggestions] = useState<TireSkuRow[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = value.trim();
    const id = ++requestId.current;
    const timeout = setTimeout(() => {
      const request = query
        ? searchTireSkus(query)
        : fetchTireSkusPage({ page: 0, pageSize: 8 }).then((p) => p.rows);
      request.then((rows) => {
        if (requestId.current === id) setSuggestions(rows);
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [value]);

  return (
    <div className="relative w-full min-w-0">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
        }}
        onFocus={() => setShowSuggestions(true)}
        onClick={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        placeholder="Search tire"
        autoComplete="off"
        className="w-full min-w-0 bg-transparent px-1.5 py-1.5 pr-5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
      />
      <button
        type="button"
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setShowSuggestions((s) => !s)}
        className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
        aria-label="Show tire options"
      >
        <ChevronDown className="size-3" />
      </button>
      {showSuggestions && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-48 max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
          {suggestions.map((sku) => (
            <li key={sku.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(sku.material);
                  setShowSuggestions(false);
                }}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
              >
                <div className="font-medium text-foreground">{sku.material}</div>
                <div className="text-xs text-muted-foreground truncate">{sku.description}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

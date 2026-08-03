import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ChevronDown, Filter, LayoutGrid, Search } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { fetchTireSkusPage, searchTireSkus } from "@/lib/tire-skus";
import type { TireSkuRow } from "@/lib/supabase";
import QtyStepper from "@/components/qty-stepper";
import { cn } from "@/lib/utils";
import { BAY_COUNT, BAY_STATUS_LABELS, type BayBooking, type BayStatus } from "@/types/tire";

const STATUS_CARD_STYLES: Record<BayStatus, string> = {
  closed: "border-success/30 bg-success-soft",
  running: "border-warning/30 bg-warning-soft",
  hold: "border-danger/30 bg-danger-soft",
};

const STATUS_PILL_STYLES: Record<BayStatus, string> = {
  closed: "bg-success text-white",
  running: "bg-warning text-white",
  hold: "bg-danger text-white",
};

const STATUS_DOT_STYLES: Record<BayStatus, string> = {
  closed: "bg-success",
  running: "bg-warning",
  hold: "bg-danger",
};

const STATUS_ROW_STYLES: Record<BayStatus, string> = {
  closed: "hover:bg-success-soft",
  running: "hover:bg-warning-soft",
  hold: "hover:bg-danger-soft",
};

const STATUS_FILTER_STYLES: Record<BayStatus, string> = {
  closed: "bg-success text-white",
  running: "bg-warning text-white",
  hold: "bg-danger text-white",
};

type StatusFilter = BayStatus | "all";

function emptyRow(bay: number): BayBooking {
  return { bay, pendingTire: "", planNo: "", status: "running", qty: 0, updatedAt: new Date().toISOString() };
}

export default function BayBooking() {
  const [rows, setRows] = useState<BayBooking[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  useEffect(() => {
    const db = readDb();
    const saved: BayBooking[] = db.bayBookings || [];
    const byBay = new Map(saved.map((r) => [r.bay, r]));
    const filled = Array.from({ length: BAY_COUNT }, (_, i) => {
      const row = byBay.get(i + 1) || emptyRow(i + 1);
      const qty = Number(row.qty);
      return { ...row, qty: Number.isFinite(qty) ? qty : 0 };
    });
    setRows(filled);
  }, []);

  const updateRow = (bay: number, patch: Partial<BayBooking>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.bay === bay ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r));
      const db = readDb();
      writeDb({ ...db, bayBookings: next });
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
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <LayoutGrid className="size-6 text-primary" />
            Loading bay
          </h1>
          <p className="text-muted-foreground">Track what's pending in each of the 13 bays.</p>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Back to home
        </Link>
      </div>

      <div className="flex items-center gap-2 max-w-xl">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRows.map((row) => (
            <BayCard key={row.bay} row={row} onChange={(patch) => updateRow(row.bay, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatusDropdown({ value, onChange }: { value: BayStatus; onChange: (status: BayStatus) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium focus:outline-none",
          STATUS_PILL_STYLES[value],
        )}
      >
        {BAY_STATUS_LABELS[value]}
        <ChevronDown className="size-3.5" />
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

function BayCard({ row, onChange }: { row: BayBooking; onChange: (patch: Partial<BayBooking>) => void }) {
  const [suggestions, setSuggestions] = useState<TireSkuRow[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const query = row.pendingTire.trim();
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
  }, [row.pendingTire]);

  return (
    <div className={cn("rounded-2xl border p-4 shadow-sm space-y-3", STATUS_CARD_STYLES[row.status])}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-card font-semibold text-foreground shadow-sm">
          {row.bay}
        </span>
        <StatusDropdown value={row.status} onChange={(status) => onChange({ status })} />
      </div>

      <div className="relative space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Pending Tire</label>
        <div className="relative">
          <input
            type="text"
            value={row.pendingTire}
            onChange={(e) => {
              onChange({ pendingTire: e.target.value });
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onClick={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search tire model"
            autoComplete="off"
            className="w-full rounded-lg border border-border bg-card px-3 py-1.5 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setShowSuggestions((s) => !s)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-label="Show tire options"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-border bg-card shadow-lg">
            {suggestions.map((sku) => (
              <li key={sku.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange({ pendingTire: sku.material });
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

      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Plan No</label>
        <input
          type="text"
          value={row.planNo}
          onChange={(e) => onChange({ planNo: e.target.value })}
          placeholder="—"
          className="w-full rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <label className="text-xs font-medium text-muted-foreground">Qty</label>
        <QtyStepper value={row.qty} min={0} onChange={(qty) => onChange({ qty })} />
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, ChevronDown, ClipboardList, Filter, LayoutGrid, Search } from "lucide-react";
import { fetchBayBookings, upsertBayBooking } from "@/lib/bay-bookings";
import { syncBayHistory } from "@/lib/bay-history";
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
      const prevRow = prev.find((r) => r.bay === bay);
      const next = prev.map((r) => (r.bay === bay ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r));
      const updatedRow = next.find((r) => r.bay === bay);
      if (updatedRow && prevRow) {
        clearTimeout(saveTimeouts.current[bay]);
        saveTimeouts.current[bay] = setTimeout(() => {
          upsertBayBooking(updatedRow);
          syncBayHistory(prevRow, updatedRow);
        }, 400);
      }
      return next;
    });
  };

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return String(r.bay).includes(q) || r.planNo.toLowerCase().includes(q);
    });
  }, [rows, search, statusFilter]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <LayoutGrid className="size-6 text-primary" />
          Loading Bay
        </h1>
        <Link
          to="/bays/pending"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary/90"
        >
          <ClipboardList className="size-4" />
          Pending Tyre
        </Link>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by bay or plan no"
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
              <col className="w-12" />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-1 py-1.5 text-center font-medium text-muted-foreground">
                  Bay
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left font-medium text-muted-foreground">
                  Plan
                </th>
                <th className="border border-border px-1.5 py-1.5 text-left font-medium text-muted-foreground">
                  Status
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
                    <div className="flex items-center gap-1.5 px-1.5">
                      <input
                        type="text"
                        value={row.planNo}
                        onChange={(e) => updateRow(row.bay, { planNo: e.target.value })}
                        placeholder="—"
                        className="w-full min-w-0 bg-transparent py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                      />
                      {row.planNo.trim() && (
                        <Link
                          to={`/bays/pending/${encodeURIComponent(row.planNo.trim())}`}
                          className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary p-1 text-white hover:bg-primary/90"
                          aria-label={`Pending tyre for plan ${row.planNo.trim()}`}
                        >
                          <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="border border-border p-1">
                    <StatusDropdown value={row.status} onChange={(status) => updateRow(row.bay, { status })} />
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

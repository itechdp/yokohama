import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  History as HistoryIcon,
  Loader2,
  Search,
} from "lucide-react";
import SelectMenu from "@/components/select-menu";
import {
  fetchHistoryRows,
  groupHistoryRows,
  localDateKey,
  type HistoryBatch,
  type HistoryRow,
  type HistoryType,
} from "@/lib/history-report";
import { exportInwardReceiptExcel, type InwardFormRow } from "@/lib/inward-excel-export";
import { exportPickSheetExcel, type PickSheetFormRow } from "@/lib/outward-excel-export";
import { cn } from "@/lib/utils";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const TYPE_OPTIONS: { value: HistoryType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inward", label: "Inward" },
  { value: "outward", label: "Outward" },
];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function skuCell(material: string, description: string): string {
  return description && description !== "—" ? `${material}\n${description}` : material;
}

export default function TireHistory() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState<HistoryType | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);

  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);

  useEffect(() => {
    fetchHistoryRows()
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  // Any filter change starts back at page 1.
  useEffect(() => {
    setPage(0);
  }, [typeFilter, dateFrom, dateTo, search]);

  // Type/date apply to the raw rows first (they're per-row facts); grouping
  // into batches happens after, so a batch never gets split across a date
  // boundary it doesn't actually cross.
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      const key = localDateKey(r.at);
      if (dateFrom && key < dateFrom) return false;
      if (dateTo && key > dateTo) return false;
      return true;
    });
  }, [rows, typeFilter, dateFrom, dateTo]);

  const batches = useMemo(() => groupHistoryRows(filteredRows), [filteredRows]);

  // Search matches a batch by Plan No, or if any of its lines' material/description match —
  // applied after grouping since it's about "does this batch contain X",
  // not a per-row fact.
  const filteredBatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return batches;
    return batches.filter(
      (b) =>
        b.planNo.toLowerCase().includes(q) ||
        b.lines.some((l) => l.material.toLowerCase().includes(q) || l.description.toLowerCase().includes(q)),
    );
  }, [batches, search]);

  const pageCount = Math.max(1, Math.ceil(filteredBatches.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const rangeStart = filteredBatches.length === 0 ? 0 : currentPage * pageSize + 1;
  const rangeEnd = Math.min(filteredBatches.length, rangeStart + pageSize - 1);
  const pageBatches = filteredBatches.slice(rangeStart - 1, rangeEnd);

  const clearFilters = () => {
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  };

  // Re-downloads a whole plan as its own form — the same Daily Receipt /
  // PICK SHEET layout used at confirm time, with every confirm made under
  // that plan no on that day, one line per material+location+pallet.
  const handleBatchDownload = async (batch: HistoryBatch) => {
    if (downloadingKey) return;
    setDownloadingKey(batch.key);
    try {
      const date = new Date(batch.at);
      const planNo = batch.planNo || undefined;
      if (batch.type === "inward") {
        const formRows: InwardFormRow[] = batch.lines.map((l) => ({
          palletNo: l.palletNo,
          skuCode: skuCell(l.material, l.description),
          qty: l.quantity,
          location: l.warehouse === "—" ? l.location : `${l.warehouse} - Bin ${l.location}`,
          receivedTime: formatTime(l.at),
          actual: "",
          putTime: formatTime(l.at),
          totalTime: "",
          remarks: "",
        }));
        await exportInwardReceiptExcel(
          { noOfTiresRecv: batch.totalQuantity, pickerName: batch.pickerName, shift: batch.shift, rows: formRows, date },
          planNo,
        );
      } else {
        const formRows: PickSheetFormRow[] = batch.lines.map((l) => ({
          palletNo: l.palletNo,
          skuCode: skuCell(l.material, l.description),
          qty: l.quantity,
          warehouse: l.warehouse,
          location: `Bin ${l.location}`,
          time: formatTime(l.at),
        }));
        await exportPickSheetExcel({ pickerName: batch.pickerName, rows: formRows, date }, planNo);
      }
    } catch (err) {
      console.error("History export failed:", err);
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <HistoryIcon className="size-6 text-primary" />
            History
          </h1>
        </div>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors shrink-0"
        >
          Back
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <div className="flex rounded-xl border border-border bg-muted/40 p-1">
          {TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTypeFilter(opt.value)}
              className={cn(
                "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                typeFilter === opt.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">From date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">To date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </label>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by plan no, material or description"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {(typeFilter !== "all" || dateFrom || dateTo || search) && (
          <button type="button" onClick={clearFilters} className="text-xs font-medium text-primary hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="size-4 animate-spin" />
          Loading history…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              {filteredBatches.length} plan{filteredBatches.length === 1 ? "" : "s"}
              {filteredBatches.length > 0 && ` — showing ${rangeStart}–${rangeEnd}`}
            </p>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Per page
              <SelectMenu
                value={String(pageSize)}
                options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                placeholder="Per page"
                onChange={(v) => {
                  setPageSize(Number(v));
                  setPage(0);
                }}
                className="w-20"
              />
            </label>
          </div>

          <div className="space-y-2">
            {pageBatches.map((b) => {
              // A plan can span several pallets across its confirms — list each once.
              const pallets = Array.from(new Set(b.lines.map((l) => l.palletNo).filter(Boolean)));
              const fields = [
                { label: "Plan No", value: b.planNo },
                { label: "Pallet No", value: pallets.join(", ") },
                { label: "Shift", value: b.shift },
                { label: b.type === "inward" ? "Supervisor" : "Picker Name", value: b.pickerName },
              ];
              return (
                <div key={b.key} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                        b.type === "inward" ? "bg-info/10 text-info" : "bg-warning-soft text-warning",
                      )}
                    >
                      {b.type === "inward" ? <ArrowDownToLine className="size-3" /> : <ArrowUpFromLine className="size-3" />}
                      {b.type === "inward" ? "Inward" : "Outward"}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {b.firstAt !== b.at ? `${formatDateTime(b.firstAt)} – ${formatTime(b.at)}` : formatDateTime(b.at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleBatchDownload(b)}
                        disabled={downloadingKey === b.key}
                        aria-label="Download plan as Excel"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
                      >
                        {downloadingKey === b.key ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
                      </button>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                    {fields.map((f) => (
                      <div key={f.label} className="min-w-0">
                        <dt className="text-xs text-muted-foreground">{f.label}</dt>
                        <dd className="text-sm font-medium text-foreground truncate">{f.value || "—"}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })}
            {pageBatches.length === 0 && (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No records match these filters.
              </div>
            )}
          </div>

          {filteredBatches.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pageCount}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={currentPage >= pageCount - 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import SelectMenu from "@/components/select-menu";
import { exportBlockTyresExcel } from "@/lib/block-tyres-excel-export";
import { formatIst } from "@/lib/bay-history";
import { fetchPlanBlockTires, isBlocked, istDateKey } from "@/lib/plan-block-tires";
import type { PlanBlockTire } from "@/types/tire";

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// The "Block" tab of the History page: every saved Block Tyres record, narrowed
// by the page's own From / To dates and search box. The Export Excel button
// lives here and nowhere else, and exports exactly the records shown.
export default function BlockTyresHistoryPanel({
  dateFrom,
  dateTo,
  search,
  pageSize,
  onPageSizeChange,
}: {
  dateFrom: string;
  dateTo: string;
  search: string;
  pageSize: number;
  // eslint-disable-next-line no-unused-vars
  onPageSizeChange: (size: number) => void;
}) {
  const [rows, setRows] = useState<PlanBlockTire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPlanBlockTires().then(({ rows: loaded, error: loadError }) => {
      if (cancelled) return;
      setRows(loaded);
      setError(loadError);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setPage(0);
  }, [dateFrom, dateTo, search, pageSize]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const day = istDateKey(r.createdAt);
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      if (q && ![r.planNo, r.material, r.description].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, dateFrom, dateTo, search]);

  const blockedQty = filtered.filter(isBlocked).reduce((sum, r) => sum + r.qty, 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const rangeStart = filtered.length === 0 ? 0 : currentPage * pageSize + 1;
  const rangeEnd = Math.min(filtered.length, rangeStart + pageSize - 1);
  const pageRows = filtered.slice(rangeStart - 1, rangeEnd);

  const handleExport = async () => {
    if (exporting || filtered.length === 0) return;
    setExporting(true);
    try {
      await exportBlockTyresExcel(filtered, { dateFrom, dateTo });
    } catch (err) {
      setError(err instanceof Error ? `Export failed: ${err.message}` : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        Loading block tyres…
      </div>
    );
  }

  return (
    <>
      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {filtered.length} record{filtered.length === 1 ? "" : "s"} · {blockedQty} tyre{blockedQty === 1 ? "" : "s"} currently blocked
          {filtered.length > 0 && ` — showing ${rangeStart}–${rangeEnd}`}
        </p>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Per page
            <SelectMenu
              value={String(pageSize)}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              placeholder="Per page"
              onChange={(v) => onPageSizeChange(Number(v))}
              className="w-20"
            />
          </label>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || filtered.length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Export Excel
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {pageRows.map((r) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                <Ban className="size-3" />
                Block
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${isBlocked(r) ? "bg-warning-soft text-warning" : "bg-success-soft text-success"}`}
                >
                  {isBlocked(r) ? "Blocked" : "Unblocked"}
                </span>
                <span className="text-xs text-muted-foreground">{formatIst(r.createdAt)}</span>
              </span>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Plan No</dt>
                <dd className="text-sm font-medium text-foreground truncate">{r.planNo}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">SKU Code</dt>
                <dd className="text-sm font-medium text-foreground truncate">{r.material}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Qty</dt>
                <dd className="text-sm font-medium text-foreground">{r.qty}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Operator</dt>
                <dd className="text-sm font-medium text-foreground truncate">{r.createdBy || "—"}</dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground break-words">{r.description || "—"}</p>
            {!isBlocked(r) && (
              <p className="text-xs text-muted-foreground">
                Unblocked {formatIst(r.unblockedAt ?? null)}
                {r.unblockedBy ? ` by ${r.unblockedBy}` : ""}
              </p>
            )}
          </div>
        ))}
        {pageRows.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No blocked tyres match these filters.
          </div>
        )}
      </div>

      {filtered.length > 0 && (
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
  );
}

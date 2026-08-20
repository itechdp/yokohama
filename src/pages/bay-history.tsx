import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, CalendarDays, Download, History } from "lucide-react";
import * as XLSX from "xlsx";
import SelectMenu from "@/components/select-menu";
import { fetchClosedOnDate, fetchMonthlyReport, formatIst, todayIst } from "@/lib/bay-history";
import { cn } from "@/lib/utils";
import { BAY_COUNT, BAY_STATUS_LABELS, type BayHistorySession } from "@/types/tire";

type View = "date" | "month";

function downloadSessions(sessions: BayHistorySession[], filename: string) {
  const rows = sessions.map((s) => ({
    Bay: s.bay,
    "Plan No": s.planNo,
    Status: BAY_STATUS_LABELS[s.status],
    "Closed At (IST)": formatIst(s.closedAt),
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Bay History");
  XLSX.writeFile(workbook, filename);
}

function currentIstMonth(): string {
  const today = todayIst();
  return today.slice(0, 7); // "YYYY-MM"
}

function formatDateLabel(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatMonthLabel(monthStr: string): string {
  return new Date(`${monthStr}-01T00:00:00+05:30`).toLocaleDateString("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  });
}

export default function BayHistory() {
  const [view, setView] = useState<View>("date");
  const [date, setDate] = useState(todayIst());
  const [month, setMonth] = useState(currentIstMonth());
  const [bayFilter, setBayFilter] = useState<number | "all">("all");
  const [sessions, setSessions] = useState<BayHistorySession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const bay = bayFilter === "all" ? undefined : bayFilter;
    const load =
      view === "date" ? fetchClosedOnDate(date, bay) : fetchMonthlyReport(Number(month.slice(0, 4)), Number(month.slice(5, 7)), bay);
    load.then((data) => {
      if (!cancelled) {
        setSessions(data);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [view, date, month, bayFilter]);

  const grouped = useMemo(() => {
    const byBay = new Map<number, BayHistorySession[]>();
    for (const s of sessions) {
      if (!byBay.has(s.bay)) byBay.set(s.bay, []);
      byBay.get(s.bay)!.push(s);
    }
    return byBay;
  }, [sessions]);

  const handleDownload = () => {
    const label = view === "date" ? date : `${month}${bayFilter !== "all" ? `-bay${bayFilter}` : ""}`;
    downloadSessions(sessions, `bay-history-${label}.xlsx`);
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link to="/bays" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Loading Bay
      </Link>

      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <History className="size-6 text-primary" />
        Bay History
      </h1>

      <div className="flex rounded-xl border border-border bg-card p-1">
        <button
          type="button"
          onClick={() => setView("date")}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            view === "date" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Date Report
        </button>
        <button
          type="button"
          onClick={() => setView("month")}
          className={cn(
            "flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
            view === "month" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Monthly Report
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === "date" ? (
          <div className="relative flex-1 min-w-[9.5rem]">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        ) : (
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="flex-1 min-w-[9.5rem] rounded-xl border border-border bg-card py-2 px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        )}

        <SelectMenu
          value={String(bayFilter)}
          placeholder="All bays"
          options={[
            { value: "all", label: "All bays" },
            ...Array.from({ length: BAY_COUNT }, (_, i) => i + 1).map((b) => ({ value: String(b), label: `Bay ${b}` })),
          ]}
          onChange={(v) => setBayFilter(v === "all" ? "all" : Number(v))}
          className="flex-1 min-w-[7rem]"
        />
      </div>

      <button
        type="button"
        onClick={handleDownload}
        disabled={sessions.length === 0}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-40"
      >
        <Download className="size-4" />
        Download Report
      </button>

      <p className="text-sm font-medium text-foreground">
        {loading ? (
          "Loading…"
        ) : bayFilter === "all" ? (
          <>
            {sessions.length} plan{sessions.length === 1 ? "" : "s"} closed on{" "}
            {view === "date" ? formatDateLabel(date) : formatMonthLabel(month)} across {grouped.size} bay
            {grouped.size === 1 ? "" : "s"}
          </>
        ) : (
          <>
            {sessions.length} plan{sessions.length === 1 ? "" : "s"} closed on Bay {bayFilter} on{" "}
            {view === "date" ? formatDateLabel(date) : formatMonthLabel(month)}
          </>
        )}
      </p>

      {!loading && sessions.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No bays were closed on {view === "date" ? formatDateLabel(date) : formatMonthLabel(month)}
          {bayFilter !== "all" ? ` on Bay ${bayFilter}` : ""}.
        </div>
      ) : (
        <div className="border border-border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-muted">
                <th className="border border-border px-2 py-1.5 text-center font-medium text-muted-foreground">
                  Bay
                </th>
                <th className="border border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                  Plan No
                </th>
                <th className="border border-border px-2 py-1.5 text-left font-medium text-muted-foreground">
                  Closed (IST)
                </th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="bg-card even:bg-muted/30 hover:bg-muted/50 transition-colors">
                  <td className="border border-border px-2 py-1.5 text-center font-semibold text-foreground">
                    {s.bay}
                  </td>
                  <td className="border border-border px-2 py-1.5 text-foreground">{s.planNo || "—"}</td>
                  <td className="border border-border px-2 py-1.5 text-foreground">{formatIst(s.closedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

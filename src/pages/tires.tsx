import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Plus, Search } from "lucide-react";
import { readDb } from "@/lib/db";
import { cn, formatInr } from "@/lib/utils";
import { STAGE_LABELS, type Tire } from "@/types/tire";

export default function Tires() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tires;
    return tires.filter(
      (t) =>
        t.serialNumber.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.size.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q),
    );
  }, [tires, search]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Tire inventory</h1>
          <p className="text-muted-foreground">Search, view and manage every tire from production onward.</p>
        </div>
        <Link
          to="/tires/new"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="size-4" />
          Add tire
        </Link>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search by serial, model, size or location"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stage</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cost</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((tire) => (
              <tr key={tire.id} className="hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{tire.serialNumber}</td>
                <td className="px-4 py-3 text-foreground">{tire.model}</td>
                <td className="px-4 py-3 text-muted-foreground">{tire.size}</td>
                <td className="px-4 py-3">
                  <StageBadge stage={tire.currentStage} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{tire.location}</td>
                <td className="px-4 py-3 text-foreground">{formatInr(tire.costPrice)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={tire.status} />
                </td>
                <td className="px-4 py-3">
                  <Link
                    to={`/tires/${tire.id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium"
                  >
                    View <ArrowRight className="size-3" />
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
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

function StageBadge({ stage }: { stage: keyof typeof STAGE_LABELS }) {
  const base = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium";
  const styles: Record<typeof stage, string> = {
    production: "bg-info-soft text-info",
    "quality-check": "bg-warning-soft text-warning",
    warehouse: "bg-success-soft text-success",
    dispatch: "bg-info-soft text-info",
    dealer: "bg-success-soft text-success",
    mounted: "bg-primary/10 text-primary",
    retread: "bg-warning-soft text-warning",
    scrapped: "bg-danger-soft text-danger",
  };
  return <span className={cn(base, styles[stage])}>{STAGE_LABELS[stage]}</span>;
}

function StatusBadge({ status }: { status: Tire["status"] }) {
  const base = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium";
  const styles: Record<Tire["status"], string> = {
    active: "bg-success-soft text-success",
    hold: "bg-warning-soft text-warning",
    sold: "bg-primary/10 text-primary",
    scrapped: "bg-danger-soft text-danger",
  };
  return <span className={cn(base, styles[status])}>{status}</span>;
}

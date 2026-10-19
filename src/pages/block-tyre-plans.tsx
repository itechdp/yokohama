import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Ban, ChevronRight } from "lucide-react";
import { fetchBayBookings } from "@/lib/bay-bookings";
import { fetchPlanBlockTires, isBlocked } from "@/lib/plan-block-tires";
import type { BayBooking, PlanBlockTire } from "@/types/tire";

// Block Tyres, step 1: every plan number currently entered on a bay (same list
// as Pending Tyres), with how many tyres are already blocked under it.
export default function BlockTyrePlans() {
  const [rows, setRows] = useState<BayBooking[]>([]);
  const [blocked, setBlocked] = useState<PlanBlockTire[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchBayBookings().then(setRows);
    fetchPlanBlockTires().then(({ rows: all, error: loadError }) => {
      setBlocked(all);
      setError(loadError);
    });
  }, []);

  const plans = useMemo(() => Array.from(new Set(rows.map((r) => r.planNo.trim()).filter(Boolean))).sort(), [rows]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link to="/bays" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Loading Bay
      </Link>

      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <Ban className="size-6 text-primary" />
        Block Tyres by Plan
      </h1>

      {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">Could not load blocked tyres: {error}</p>}

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No plan numbers entered on any bay yet.
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((planNo) => {
            const total = blocked.filter((t) => t.planNo === planNo && isBlocked(t)).reduce((sum, t) => sum + t.qty, 0);
            return (
              <Link
                key={planNo}
                to={`/bays/block/${encodeURIComponent(planNo)}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Plan {planNo}</p>
                  <p className="text-xs text-muted-foreground">{total > 0 ? `${total} tyre blocked` : "No tyre blocked"}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, ChevronRight, ClipboardList } from "lucide-react";
import { fetchBayBookings } from "@/lib/bay-bookings";
import { fetchPlanPendingTires } from "@/lib/plan-pending-tires";
import type { BayBooking, PlanPendingTire } from "@/types/tire";

export default function PendingTyrePlans() {
  const [rows, setRows] = useState<BayBooking[]>([]);
  const [pendingTires, setPendingTires] = useState<PlanPendingTire[]>([]);

  useEffect(() => {
    fetchBayBookings().then(setRows);
    fetchPlanPendingTires().then(setPendingTires);
  }, []);

  const plans = useMemo(
    () => Array.from(new Set(rows.map((r) => r.planNo.trim()).filter(Boolean))).sort(),
    [rows],
  );

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <Link to="/bays" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" />
        Loading Bay
      </Link>

      <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
        <ClipboardList className="size-6 text-primary" />
        Pending Tyre by Plan
      </h1>

      {plans.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No plan numbers entered on any bay yet.
        </div>
      ) : (
        <div className="space-y-2">
          {plans.map((planNo) => {
            const total = pendingTires
              .filter((t) => t.planNo === planNo)
              .reduce((sum, t) => sum + t.qty, 0);
            return (
              <Link
                key={planNo}
                to={`/bays/pending/${encodeURIComponent(planNo)}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">Plan {planNo}</p>
                  <p className="text-xs text-muted-foreground">
                    {total > 0 ? `${total} tyre pending` : "No tyre pending"}
                  </p>
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

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { PackageCheck } from "lucide-react";
import CaseSelector from "@/components/case-selector";
import PendingPutawayPanel from "@/components/pending-putaway-panel";
import SuccessOverlay from "@/components/success-overlay";
import type { WarehouseDef } from "@/data/warehouse-bins";
import { useSelectedCase } from "@/hooks/use-selected-case";
import { fetchWarehouses } from "@/lib/warehouses";

// The forklift employee's side of Inward: pallets the cage saved wait here
// until they are put away into a bin.
export default function PendingPutaway() {
  const [warehouses, setWarehouses] = useState<WarehouseDef[]>([]);
  const [caseNo, setCaseNo] = useSelectedCase();
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchWarehouses().then(setWarehouses);
  }, []);

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <PackageCheck className="size-6 text-primary" />
          Putaway
        </h1>
        <Link
          to="/"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Back
        </Link>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-1.5">
        <span className="text-sm font-medium text-foreground">Case</span>
        <CaseSelector value={caseNo} onChange={setCaseNo} />
      </div>
      <PendingPutawayPanel warehouses={warehouses} caseNo={caseNo} onPutAway={setSuccess} />
      <SuccessOverlay message={success} onDone={() => setSuccess(null)} />
    </div>
  );
}

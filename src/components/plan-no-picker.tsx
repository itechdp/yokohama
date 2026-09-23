import type { PlanNoKind } from "@/lib/plan-numbers";

// A single typeable input for Plan No. `kind` is accepted for API
// compatibility with callers (Inward/Outward each pass their own pool) even
// though this component no longer looks anything up by it.
export default function PlanNoPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (planNo: string) => void;
  kind: PlanNoKind;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Enter plan no"
      autoComplete="off"
      className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
    />
  );
}

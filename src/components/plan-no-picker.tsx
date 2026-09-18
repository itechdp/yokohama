import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTodayPlanNumbers, type PlanNoKind } from "@/lib/plan-numbers";

// A single typeable input for Plan No, with a dropdown of today's existing
// plan numbers (shared across devices, backed by the DB — see
// plan-numbers.ts — never localStorage) to pick from. `kind` scopes both the
// dropdown and the registry to Inward or Outward — the two never share a
// pool, so an Outward plan no doesn't show up here on Inward and vice versa.
// Typing a value that isn't in the list is just a new plan no; nothing is
// registered until it's actually used on a confirm (see handleConfirm in
// tire-inward.tsx / tire-outward.tsx), so the dropdown only ever fills with
// plan numbers something was actually confirmed under — and a plan no drops
// out of it again once it hasn't been touched since before today.
export default function PlanNoPicker({
  value,
  onChange,
  kind,
}: {
  value: string;
  onChange: (planNo: string) => void;
  kind: PlanNoKind;
}) {
  const [planNumbers, setPlanNumbers] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchTodayPlanNumbers(kind).then(setPlanNumbers);
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filtered = q ? planNumbers.filter((p) => p.toLowerCase().includes(q)) : planNumbers;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder="Type or pick today's plan no"
          autoComplete="off"
          className="w-full rounded-xl border border-border bg-card py-3 pl-4 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Show today's plan nos"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex size-6 items-center justify-center text-muted-foreground"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border border-border bg-card shadow-lg divide-y divide-border">
          {planNumbers.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No plan nos used yet today.</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No match — this will be a new plan no.</p>
          ) : (
            filtered.map((planNo) => (
              <button
                key={planNo}
                type="button"
                onClick={() => {
                  onChange(planNo);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                  planNo === value && "bg-primary/10 text-primary font-medium",
                )}
              >
                {planNo}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

import { cn } from "@/lib/utils";
import type { CaseNo } from "@/types/tire";

// Cage 1 / Cage 2 switch used on Inward and Putaway. `value` is null until
// the operator has chosen a case (neither button is highlighted).
export default function CaseSelector({
  value,
  onChange,
  disabled,
}: {
  value: CaseNo | null;
  // eslint-disable-next-line no-unused-vars
  onChange: (next: CaseNo) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex gap-1 rounded-xl border border-border bg-muted p-1" role="group" aria-label="Cage">
      {([1, 2] as const).map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          aria-pressed={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40",
            value === n ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Cage {n}
        </button>
      ))}
    </div>
  );
}

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

// Tap-only quantity control — no keyboard needed, for non-technical / mobile use.
export default function QtyStepper({ value, onChange, min = 1, max }: QtyStepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={atMin}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors",
          atMin ? "opacity-40 cursor-not-allowed" : "hover:bg-muted",
        )}
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" />
      </button>
      <span className="w-8 text-center text-base font-semibold text-foreground">{value}</span>
      <button
        type="button"
        onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}
        disabled={atMax}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors",
          atMax ? "opacity-40 cursor-not-allowed" : "hover:bg-muted",
        )}
        aria-label="Increase quantity"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}

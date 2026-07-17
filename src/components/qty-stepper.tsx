import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QtyStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

export default function QtyStepper({ value, onChange, min = 1, max }: QtyStepperProps) {
  const atMin = value <= min;
  const atMax = max !== undefined && value >= max;

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(String(value));
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const parsed = Math.floor(Number(draft));
    if (!Number.isFinite(parsed)) return;
    let next = parsed;
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    if (next !== value) onChange(next);
  };

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

      {editing ? (
        <input
          ref={inputRef}
          type="number"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          className="w-12 rounded-lg border border-border bg-card text-center text-base font-semibold text-foreground [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-8 text-center text-base font-semibold text-foreground"
          aria-label="Edit quantity"
        >
          {value}
        </button>
      )}

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

import { MODULES } from "@/lib/modules";
import type { ModuleKey } from "@/lib/user-policy";

// Checklist of the modules an Operator may use. Admins pick these when creating or editing
// an Operator; Admins and the Super Admin themselves always have every module.
export default function ModulePicker({
  value,
  onChange,
  disabled,
}: {
  value: ModuleKey[];
  onChange: (next: ModuleKey[]) => void;
  disabled?: boolean;
}) {
  const selected = new Set(value);
  const toggle = (key: ModuleKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(MODULES.map((m) => m.key).filter((k) => next.has(k)));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {value.length} of {MODULES.length} selected
        </span>
        <div className="flex items-center gap-3 text-xs font-medium">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(MODULES.map((m) => m.key))}
            className="text-primary hover:underline disabled:opacity-40"
          >
            Select all
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange([])}
            className="text-muted-foreground hover:underline disabled:opacity-40"
          >
            Clear
          </button>
        </div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {MODULES.map((m) => {
          const on = selected.has(m.key);
          return (
            <label
              key={m.key}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 text-left transition-colors ${
                on ? "border-primary bg-primary-soft" : "border-border bg-card hover:bg-muted"
              } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={disabled}
                onChange={() => toggle(m.key)}
                className="mt-0.5 size-4 accent-[var(--color-primary,#f97316)]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{m.label}</span>
                <span className="block text-xs text-muted-foreground">{m.covers}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

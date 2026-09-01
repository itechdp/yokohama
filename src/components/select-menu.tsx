import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectMenuOption {
  value: string;
  label: string;
}

// Themed stand-in for a native <select> — the OS picker a native select opens
// (especially on Android WebView) can't be restyled and renders outside the
// app's own theme/colors, so this renders its own list instead. The list is
// portaled to <body> and positioned with fixed coordinates (not absolute
// inside the trigger) so it isn't clipped by any scrollable/overflow-hidden
// ancestor, e.g. the columns list on the Warehouses page.
export default function SelectMenu({
  value,
  options,
  placeholder,
  disabled,
  onChange,
  className,
}: {
  value: string;
  options: SelectMenuOption[];
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Anchored below the trigger by default, same as before. But near the
  // bottom of a short viewport (mobile especially) that can push most of the
  // list off-screen — so when there isn't enough room below, flip it to open
  // upward instead, and always cap the height to whatever space is actually
  // available rather than a flat 224px, so the full list stays reachable.
  const updateRect = () => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const margin = 8;
    const preferredMaxHeight = 224; // matches the old max-h-56
    const minUsableHeight = 120;
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const openUp = spaceBelow < minUsableHeight && spaceAbove > spaceBelow;
    const maxHeight = Math.max(80, Math.min(preferredMaxHeight, openUp ? spaceAbove : spaceBelow));
    setRect({
      left: r.left,
      width: r.width,
      maxHeight,
      ...(openUp ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (!open) return;
    updateRect();
    const handleClick = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        listRef.current &&
        !listRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className="w-full flex items-center justify-between gap-1 rounded-lg border border-border bg-card px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <span className={cn("truncate text-left", !selected && "text-muted-foreground")}>{selected ? selected.label : placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            style={{
              position: "fixed",
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
              ...(rect.top !== undefined ? { top: rect.top } : { bottom: rect.bottom }),
            }}
            className="z-[100] overflow-y-auto rounded-lg border border-border bg-card shadow-lg py-1"
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">No options</p>
            ) : (
              options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left text-sm transition-colors",
                    o.value === value ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted",
                  )}
                >
                  {o.label}
                </button>
              ))
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

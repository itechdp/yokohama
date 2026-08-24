import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Themed stand-in for window.confirm() — a native confirm() renders as an OS
// dialog outside the app's theme (see select-menu.tsx for the same issue with
// native <select>), so this renders its own modal instead, styled like every
// other overlay in the app (fixed inset-0 + bg-card card).
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Styles the confirm button red and shows a warning icon — use for
  // destructive, hard-to-reverse actions like delete.
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title ?? message}
        className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {destructive && (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/10 text-danger">
              <AlertTriangle className="size-5" />
            </span>
          )}
          <div className="space-y-1 pt-0.5">
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors",
              destructive ? "bg-danger hover:bg-danger/90" : "bg-primary hover:bg-primary/90",
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

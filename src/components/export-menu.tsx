import { FileSpreadsheet, FileText, Loader2, X } from "lucide-react";

// Styled the same way as ConfirmDialog — a themed fixed-overlay modal, not a
// native popover, so it matches the rest of the app.
export default function ExportMenu({
  open,
  title,
  infoLines,
  busy,
  error,
  onExportPDF,
  onExportExcel,
  onClose,
}: {
  open: boolean;
  title: string;
  infoLines?: string[];
  busy: boolean;
  error: string | null;
  onExportPDF: () => void;
  onExportExcel: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground pt-0.5">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        {infoLines && infoLines.length > 0 && (
          <div className="rounded-xl bg-muted px-3 py-2 text-sm text-foreground space-y-0.5">
            {infoLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

        <div className="space-y-2">
          <button
            type="button"
            onClick={onExportPDF}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
            Export PDF
          </button>
          <button
            type="button"
            onClick={onExportExcel}
            disabled={busy}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />}
            Export Excel
          </button>
        </div>
      </div>
    </div>
  );
}

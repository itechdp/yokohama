import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, History, MoveRight } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn, formatInr } from "@/lib/utils";
import { NEXT_STAGE, STAGE_LABELS, type StageHistory, type Tire, type TireStage } from "@/types/tire";

export default function TireDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tire, setTire] = useState<Tire | null>(null);
  const [history, setHistory] = useState<StageHistory[]>([]);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [movedBy, setMovedBy] = useState("");

  useEffect(() => {
    const db = readDb();
    const tires: Tire[] = db.tires || [];
    const allHistory: StageHistory[] = db.tireHistory || [];
    const found = tires.find((t) => t.id === id) || null;
    setTire(found);
    setHistory(allHistory.filter((h) => h.tireId === id).sort((a, b) => b.movedAt.localeCompare(a.movedAt)));
  }, [id]);

  const nextStage = useMemo(() => (tire ? NEXT_STAGE[tire.currentStage] : null), [tire]);

  const handleMove = () => {
    if (!tire || !nextStage) return;
    const db = readDb();
    const tires: Tire[] = db.tires || [];
    const allHistory: StageHistory[] = db.tireHistory || [];
    const now = new Date().toISOString();

    const updated: Tire = {
      ...tire,
      currentStage: nextStage,
      location: location.trim() || tire.location,
      status: nextStage === "scrapped" ? "scrapped" : nextStage === "mounted" ? "sold" : tire.status,
      updatedAt: now,
    };

    const newEntry: StageHistory = {
      id: `h-${Date.now()}`,
      tireId: tire.id,
      stage: nextStage,
      location: updated.location,
      movedAt: now,
      movedBy: movedBy.trim() || "Unknown",
      notes: notes.trim(),
    };

    writeDb({
      ...db,
      tires: tires.map((t) => (t.id === tire.id ? updated : t)),
      tireHistory: [...allHistory, newEntry],
    });

    setTire(updated);
    setHistory((prev) => [newEntry, ...prev]);
    setLocation("");
    setNotes("");
    setMovedBy("");
  };

  if (!tire) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Tire not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back
      </button>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">{tire.serialNumber}</h1>
                <p className="text-muted-foreground">{tire.model}</p>
              </div>
              <StageBadge stage={tire.currentStage} />
            </div>

            <dl className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="font-medium text-foreground">{tire.size}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Production date</dt>
                <dd className="font-medium text-foreground">{tire.productionDate}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Current location</dt>
                <dd className="font-medium text-foreground">{tire.location}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize font-medium text-foreground">{tire.status}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Cost price</dt>
                <dd className="font-medium text-foreground">{formatInr(tire.costPrice)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Warranty</dt>
                <dd className="font-medium text-foreground">{tire.warrantyMonths} months</dd>
              </div>
            </dl>

            {tire.notes && (
              <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
                <p className="text-muted-foreground">Notes</p>
                <p className="text-foreground">{tire.notes}</p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
              <History className="size-5 text-primary" /> Stage history
            </h2>
            <ol className="mt-4 space-y-3">
              {history.map((entry) => (
                <li key={entry.id} className="relative pl-6 border-l border-border">
                  <span className="absolute left-[-5px] top-1.5 size-2.5 rounded-full bg-primary" />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <p className="text-sm font-medium text-foreground">
                      {STAGE_LABELS[entry.stage]} — {entry.location}
                    </p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.movedAt).toLocaleString("en-IN")}</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    By {entry.movedBy}
                    {entry.notes ? ` • ${entry.notes}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sticky top-6">
            <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
              <MoveRight className="size-5 text-primary" /> Move tire
            </h2>
            {nextStage ? (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-muted p-3 text-sm">
                  <p className="text-muted-foreground">Next stage</p>
                  <p className="font-semibold text-foreground">{STAGE_LABELS[nextStage]}</p>
                </div>
                <Field label="New location" value={location} onChange={setLocation} placeholder={tire.location} />
                <Field label="Moved by" value={movedBy} onChange={setMovedBy} placeholder="Operator name" />
                <Field label="Notes" value={notes} onChange={setNotes} placeholder="Optional" />
                <button
                  onClick={handleMove}
                  className="w-full rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Move to {STAGE_LABELS[nextStage]}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">This tire has reached the end of its lifecycle.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function StageBadge({ stage }: { stage: TireStage }) {
  const base = "inline-flex rounded-full px-2.5 py-1 text-xs font-medium";
  const styles: Record<TireStage, string> = {
    production: "bg-info-soft text-info",
    "quality-check": "bg-warning-soft text-warning",
    warehouse: "bg-success-soft text-success",
    dispatch: "bg-info-soft text-info",
    dealer: "bg-success-soft text-success",
    mounted: "bg-primary/10 text-primary",
    retread: "bg-warning-soft text-warning",
    scrapped: "bg-danger-soft text-danger",
  };
  return <span className={cn(base, styles[stage])}>{STAGE_LABELS[stage]}</span>;
}

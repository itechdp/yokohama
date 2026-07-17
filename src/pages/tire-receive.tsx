import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, Import, MapPin, PackageCheck, User } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn, formatInr } from "@/lib/utils";
import { STAGE_LABELS, type StageHistory, type Tire } from "@/types/tire";

const STORAGE_LOCATIONS = [
  "Bangalore WH - Zone A",
  "Bangalore WH - Zone B",
  "Chennai WH - Zone A",
  "Chennai WH - Zone B",
  "Pune WH - Zone A",
  "Pune WH - Zone B",
  "Mysore WH - Zone A",
];

export default function TireReceive() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [location, setLocation] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
  }, []);

  const candidates = useMemo(
    () => tires.filter((t) => t.currentStage === "production"),
    [tires],
  );

  const allSelected = candidates.length > 0 && selected.size === candidates.length;

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(candidates.map((t) => t.id)));
    }
  };

  const handleReceive = () => {
    setError(null);
    setSuccess(false);

    if (selected.size === 0) {
      setError("Select at least one tire to receive.");
      return;
    }
    if (!location.trim()) {
      setError("Choose a storage location.");
      return;
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const now = new Date().toISOString();
    const receiver = receivedBy.trim() || "Warehouse staff";

    const updatedTires = tiresList.map((t) => {
      if (!selected.has(t.id)) return t;
      return {
        ...t,
        currentStage: "warehouse" as const,
        location: location.trim(),
        updatedAt: now,
      };
    });

    const newEntries: StageHistory[] = Array.from(selected).map((tireId, i) => ({
      id: `h-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      stage: "warehouse",
      location: location.trim(),
      movedAt: now,
      movedBy: receiver,
      notes: "Received from production",
    }));

    writeDb({
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList, ...newEntries],
    });

    setTires(updatedTires);
    setSelected(new Set());
    setReceivedBy("");
    setSuccess(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Import className="size-6 text-primary" />
            Receive from production
          </h1>
          <p className="text-muted-foreground">
            Select tires fresh from production and assign a warehouse storage location.
          </p>
        </div>
        <Link
          to="/tires"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Back to inventory
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-medium text-foreground">
              Tires arriving from production
            </h2>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="size-4 rounded border-border text-primary focus:ring-ring"
              />
              Select all
            </label>
          </div>

          {candidates.length === 0 ? (
            <div className="rounded-xl bg-muted p-8 text-center text-muted-foreground">
              No tires are currently in production.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 w-10" />
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Production date</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Current location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {candidates.map((tire) => {
                    const isSelected = selected.has(tire.id);
                    return (
                      <tr
                        key={tire.id}
                        onClick={() => toggleOne(tire.id)}
                        className={cn(
                          "cursor-pointer transition-colors",
                          isSelected ? "bg-primary/5" : "hover:bg-muted/50",
                        )}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOne(tire.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="size-4 rounded border-border text-primary focus:ring-ring"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{tire.serialNumber}</td>
                        <td className="px-4 py-3 text-foreground">{tire.model}</td>
                        <td className="px-4 py-3 text-muted-foreground">{tire.size}</td>
                        <td className="px-4 py-3 text-muted-foreground">{tire.productionDate}</td>
                        <td className="px-4 py-3 text-muted-foreground">{tire.location}</td>
                        <td className="px-4 py-3 text-foreground">{formatInr(tire.costPrice)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {selected.size > 0 && (
            <p className="text-sm text-muted-foreground">
              {selected.size} tire{selected.size === 1 ? "" : "s"} selected
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-fit space-y-4">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <PackageCheck className="size-5 text-primary" />
            Storage assignment
          </h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MapPin className="size-4 text-muted-foreground" />
              Storage location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Choose a location</option>
              {STORAGE_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <User className="size-4 text-muted-foreground" />
              Received by
            </label>
            <input
              type="text"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="Operator name"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
          )}

          {success && (
            <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
              <Check className="size-4" />
              Tires received and locations assigned.
            </div>
          )}

          <button
            onClick={handleReceive}
            disabled={candidates.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Receive {selected.size > 0 ? `${selected.size} tire${selected.size === 1 ? "" : "s"}` : "selected tires"}
          </button>

          <p className="text-xs text-muted-foreground">
            Receiving moves selected tires from{" "}
            <span className="font-medium text-foreground">{STAGE_LABELS.production}</span> to{" "}
            <span className="font-medium text-foreground">{STAGE_LABELS.warehouse}</span> and records the
            new storage location in their history.
          </p>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, ClipboardList, MapPin, Package, Truck, User } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn, formatInr } from "@/lib/utils";
import {
  DISPATCH_STATUS_LABELS,
  STAGE_LABELS,
  type DispatchStatus,
  type ShipmentTrackingUpdate,
  type StageHistory,
  type Tire,
  type TireDispatch,
} from "@/types/tire";

const DEALER_DESTINATIONS = [
  "Pune Dealer",
  "Bangalore Dealer",
  "Chennai Dealer",
  "Mysore Dealer",
  "Hyderabad Dealer",
  "Other",
];

export default function TireDispatch() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<TireDispatch[]>([]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [driverName, setDriverName] = useState("");
  const [destination, setDestination] = useState("");
  const [otherDestination, setOtherDestination] = useState("");
  const [dispatchedBy, setDispatchedBy] = useState("");
  const [notes, setNotes] = useState("");

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setDispatchLogs((db.dispatchLogs as TireDispatch[]) || []);
  }, []);

  const candidates = useMemo(
    () => tires.filter((t) => t.currentStage === "warehouse"),
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

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    if (value !== "Other") setOtherDestination("");
  };

  const finalDestination = destination === "Other" ? otherDestination.trim() : destination;

  const handleDispatch = () => {
    setError(null);
    setSuccess(false);

    if (selected.size === 0) {
      setError("Select at least one tire to dispatch.");
      return;
    }
    if (!driverName.trim()) {
      setError("Enter the driver name.");
      return;
    }
    if (!finalDestination) {
      setError("Choose a destination.");
      return;
    }
    if (!dispatchedBy.trim()) {
      setError("Enter the person dispatching the shipment.");
      return;
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const trackingList: ShipmentTrackingUpdate[] = db.shipmentTrackingUpdates || [];
    const now = new Date().toISOString();

    const selectedIds = Array.from(selected);

    const updatedTires = tiresList.map((t) => {
      if (!selected.has(t.id)) return t;
      return {
        ...t,
        currentStage: "dispatch" as const,
        location: finalDestination,
        updatedAt: now,
      };
    });

    const newHistory: StageHistory[] = selectedIds.map((tireId, i) => ({
      id: `h-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      stage: "dispatch",
      location: finalDestination,
      movedAt: now,
      movedBy: dispatchedBy.trim(),
      notes: `Driver: ${driverName.trim()}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
    }));

    const newLogs: TireDispatch[] = selectedIds.map((tireId, i) => ({
      id: `d-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      driverName: driverName.trim(),
      destination: finalDestination,
      dispatchedAt: now,
      dispatchedBy: dispatchedBy.trim(),
      status: "picked-up",
      notes: notes.trim(),
    }));

    const newTrackingUpdates: ShipmentTrackingUpdate[] = newLogs.map((log) => ({
      id: `st-${Date.now()}-${log.tireId}-${Math.random().toString(36).slice(2, 7)}`,
      dispatchId: log.id,
      tireId: log.tireId,
      status: "picked-up",
      location: finalDestination,
      updatedAt: now,
      updatedBy: dispatchedBy.trim(),
      notes: `Driver ${driverName.trim()} picked up shipment`,
    }));

    const updatedDb = {
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList, ...newHistory],
      dispatchLogs: [...logsList, ...newLogs],
      shipmentTrackingUpdates: [...trackingList, ...newTrackingUpdates],
    };

    writeDb(updatedDb);
    setTires(updatedTires);
    setDispatchLogs(updatedDb.dispatchLogs as TireDispatch[]);

    setSelected(new Set());
    setDriverName("");
    setDestination("");
    setOtherDestination("");
    setDispatchedBy("");
    setNotes("");
    setSuccess(true);
  };

  const markDelivered = (logId: string, tireId: string) => {
    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const trackingList: ShipmentTrackingUpdate[] = db.shipmentTrackingUpdates || [];
    const now = new Date().toISOString();

    const log = logsList.find((l) => l.id === logId);
    if (!log) return;

    const updatedTires = tiresList.map((t) => {
      if (t.id !== tireId) return t;
      return {
        ...t,
        currentStage: "dealer" as const,
        location: log.destination,
        updatedAt: now,
      };
    });

    const updatedLogs = logsList.map((l) =>
      l.id === logId ? { ...l, status: "delivered" as DispatchStatus } : l,
    );

    const newHistory: StageHistory = {
      id: `h-${Date.now()}-delivery-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      stage: "dealer",
      location: log.destination,
      movedAt: now,
      movedBy: "Driver / depot",
      notes: `Delivered by ${log.driverName}`,
    };

    const newTrackingUpdate: ShipmentTrackingUpdate = {
      id: `st-${Date.now()}-${logId}-${Math.random().toString(36).slice(2, 7)}`,
      dispatchId: logId,
      tireId,
      status: "delivered",
      location: log.destination,
      updatedAt: now,
      updatedBy: log.driverName,
      notes: "Delivered and signed off",
    };

    const updatedDb = {
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList, newHistory],
      dispatchLogs: updatedLogs,
      shipmentTrackingUpdates: [...trackingList, newTrackingUpdate],
    };

    writeDb(updatedDb);
    setTires(updatedTires);
    setDispatchLogs(updatedLogs);
  };

  const sortedLogs = useMemo(
    () =>
      dispatchLogs
        .slice()
        .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
        .slice(0, 50),
    [dispatchLogs],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Truck className="size-6 text-primary" />
            Dispatch tires
          </h1>
          <p className="text-muted-foreground">
            Record which driver has taken a tire shipment for delivery and where it is headed.
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
            <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Package className="size-5 text-primary" />
              Warehouse tires ready for dispatch
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
              No warehouse tires are available to dispatch.
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
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
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
            <Truck className="size-5 text-primary" />
            Shipment assignment
          </h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <User className="size-4 text-muted-foreground" />
              Driver name
            </label>
            <input
              type="text"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
              placeholder="e.g. Rajesh M"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <MapPin className="size-4 text-muted-foreground" />
              Destination
            </label>
            <select
              value={destination}
              onChange={(e) => handleDestinationChange(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Choose a destination</option>
              {DEALER_DESTINATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            {destination === "Other" && (
              <input
                type="text"
                value={otherDestination}
                onChange={(e) => setOtherDestination(e.target.value)}
                placeholder="Enter custom destination"
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <User className="size-4 text-muted-foreground" />
              Dispatched by
            </label>
            <input
              type="text"
              value={dispatchedBy}
              onChange={(e) => setDispatchedBy(e.target.value)}
              placeholder="Warehouse supervisor / operator"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <ClipboardList className="size-4 text-muted-foreground" />
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional dispatch notes"
              rows={3}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
          )}

          {success && (
            <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
              <Check className="size-4" />
              Shipment recorded successfully.
            </div>
          )}

          <button
            onClick={handleDispatch}
            disabled={candidates.length === 0}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Dispatch {selected.size > 0 ? `${selected.size} tire${selected.size === 1 ? "" : "s"}` : "selected tires"}
          </button>

          <p className="text-xs text-muted-foreground">
            Dispatching moves selected tires from{" "}
            <span className="font-medium text-foreground">{STAGE_LABELS.warehouse}</span> to{" "}
            <span className="font-medium text-foreground">{STAGE_LABELS.dispatch}</span> and links them
            to a driver for delivery tracking.
          </p>
        </div>
      </div>

      {dispatchLogs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Dispatch tracking
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatched at</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatched by</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedLogs.map((log) => {
                  const tire = tires.find((t) => t.id === log.tireId);
                  return (
                    <tr key={log.id}>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {tire ? tire.serialNumber : log.tireId}
                      </td>
                      <td className="px-4 py-3 text-foreground">{tire ? tire.model : "—"}</td>
                      <td className="px-4 py-3 text-foreground">{log.destination}</td>
                      <td className="px-4 py-3 text-foreground">{log.driverName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(log.dispatchedAt).toLocaleString("en-IN")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{log.dispatchedBy}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-4 py-3">
                        {log.status !== "delivered" && log.status !== "returned" ? (
                          <button
                            onClick={() => markDelivered(log.id, log.tireId)}
                            className="inline-flex items-center gap-1 rounded-lg bg-success-soft px-2.5 py-1 text-xs font-medium text-success hover:bg-success/20 transition-colors"
                          >
                            <Check className="size-3.5" />
                            Mark delivered
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: DispatchStatus }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  const styles: Record<DispatchStatus, string> = {
    "picked-up": "bg-info-soft text-info",
    loaded: "bg-info-soft text-info",
    "in-transit": "bg-info-soft text-info",
    "at-hub": "bg-warning-soft text-warning",
    "out-for-delivery": "bg-warning-soft text-warning",
    delivered: "bg-success-soft text-success",
    delayed: "bg-danger-soft text-danger",
    returned: "bg-danger-soft text-danger",
  };
  return (
    <span className={cn(base, styles[status])}>
      {DISPATCH_STATUS_LABELS[status]}
    </span>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Truck,
  User,
} from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  DELIVERY_PROGRESS,
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_ORDER,
  type DispatchStatus,
  type ShipmentTrackingUpdate,
  type StageHistory,
  type Tire,
  type TireDispatch,
} from "@/types/tire";

export default function TireShipmentTracking() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<TireDispatch[]>([]);
  const [trackingUpdates, setTrackingUpdates] = useState<ShipmentTrackingUpdate[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>("all");
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set());
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [newStatus, setNewStatus] = useState<DispatchStatus>("in-transit");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [updatedBy, setUpdatedBy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = () => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setDispatchLogs((db.dispatchLogs as TireDispatch[]) || []);
    setTrackingUpdates((db.shipmentTrackingUpdates as ShipmentTrackingUpdate[]) || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeShipments = useMemo(
    () => dispatchLogs.filter((l) => l.status !== "delivered" && l.status !== "returned"),
    [dispatchLogs],
  );

  const drivers = useMemo(
    () => Array.from(new Set(activeShipments.map((s) => s.driverName))).sort(),
    [activeShipments],
  );

  const filteredShipments = useMemo(() => {
    if (selectedDriver === "all") return activeShipments;
    return activeShipments.filter((s) => s.driverName === selectedDriver);
  }, [activeShipments, selectedDriver]);

  const shipmentUpdates = useMemo(() => {
    const map: Record<string, ShipmentTrackingUpdate[]> = {};
    for (const update of trackingUpdates) {
      if (!map[update.dispatchId]) map[update.dispatchId] = [];
      map[update.dispatchId].push(update);
    }
    for (const id of Object.keys(map)) {
      map[id].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [trackingUpdates]);

  const toggleExpand = (id: string) => {
    setExpandedShipments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openUpdateForm = (log: TireDispatch) => {
    setUpdatingId(log.id);
    setNewStatus(getNextStatus(log.status));
    setLocation("");
    setNotes("");
    setUpdatedBy("");
    setError(null);
    setSuccess(null);
  };

  const closeUpdateForm = () => {
    setUpdatingId(null);
  };

  const handleUpdate = (log: TireDispatch) => {
    setError(null);
    setSuccess(null);

    if (!location.trim()) {
      setError("Enter the current location.");
      return;
    }
    if (!updatedBy.trim()) {
      setError("Enter who is updating the status.");
      return;
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const trackingList: ShipmentTrackingUpdate[] = db.shipmentTrackingUpdates || [];
    const now = new Date().toISOString();

    const updatedLogs = logsList.map((l) =>
      l.id === log.id ? { ...l, status: newStatus } : l,
    );

    const newTrackingUpdate: ShipmentTrackingUpdate = {
      id: `st-${Date.now()}-${log.id}-${Math.random().toString(36).slice(2, 7)}`,
      dispatchId: log.id,
      tireId: log.tireId,
      status: newStatus,
      location: location.trim(),
      updatedAt: now,
      updatedBy: updatedBy.trim(),
      notes: notes.trim(),
    };

    const updatedTires = tiresList.map((t) => {
      if (t.id !== log.tireId) return t;
      if (newStatus === "returned") {
        return { ...t, currentStage: "warehouse" as const, location: location.trim(), updatedAt: now };
      }
      if (newStatus === "delivered") {
        return { ...t, currentStage: "dealer" as const, location: log.destination, updatedAt: now };
      }
      return { ...t, currentStage: "dispatch" as const, location: location.trim(), updatedAt: now };
    });

    if (newStatus === "delivered" || newStatus === "returned") {
      const newHistory: StageHistory = {
        id: `h-${Date.now()}-${log.id}-${Math.random().toString(36).slice(2, 7)}`,
        tireId: log.tireId,
        stage: newStatus === "delivered" ? "dealer" : "warehouse",
        location: newStatus === "delivered" ? log.destination : location.trim(),
        movedAt: now,
        movedBy: updatedBy.trim(),
        notes: `${DISPATCH_STATUS_LABELS[newStatus]}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
      };
      historyList.push(newHistory);
    }

    const updatedDb = {
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList],
      dispatchLogs: updatedLogs,
      shipmentTrackingUpdates: [...trackingList, newTrackingUpdate],
    };

    writeDb(updatedDb);
    setTires(updatedTires);
    setDispatchLogs(updatedLogs);
    setTrackingUpdates(updatedDb.shipmentTrackingUpdates as ShipmentTrackingUpdate[]);

    setSuccess(`Shipment updated to ${DISPATCH_STATUS_LABELS[newStatus]}.`);
    setTimeout(() => {
      closeUpdateForm();
    }, 1200);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Route className="size-6 text-primary" />
            Delivery tracking
          </h1>
          <p className="text-muted-foreground">
            Monitor live delivery progress for each driver and update shipment statuses.
          </p>
        </div>
        <Link
          to="/tires/dispatch"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Truck className="size-4" />
          Dispatch tires
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Truck}
          label="Active shipments"
          value={activeShipments.length.toString()}
        />
        <StatCard
          icon={User}
          label="Drivers on road"
          value={drivers.length.toString()}
        />
        <StatCard
          icon={Clock}
          label="Out for delivery"
          value={activeShipments.filter((s) => s.status === "out-for-delivery").length.toString()}
        />
        <StatCard
          icon={AlertTriangle}
          label="Delayed / returned"
          value={activeShipments.filter((s) => s.status === "delayed" || s.status === "returned").length.toString()}
        />
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <label className="text-sm font-medium text-foreground">Filter by driver</label>
        <select
          value={selectedDriver}
          onChange={(e) => setSelectedDriver(e.target.value)}
          className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="all">All drivers</option>
          {drivers.map((driver) => (
            <option key={driver} value={driver}>
              {driver}
            </option>
          ))}
        </select>
      </div>

      {filteredShipments.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          No active shipments to track.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filteredShipments.map((log) => {
            const tire = tires.find((t) => t.id === log.tireId);
            const updates = shipmentUpdates[log.id] || [];
            const latestUpdate = updates[0];
            const progress = DELIVERY_PROGRESS[log.status] ?? 0;
            const isExpanded = expandedShipments.has(log.id);
            const isUpdating = updatingId === log.id;

            return (
              <div
                key={log.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Package className="size-4 text-primary" />
                      <span className="font-semibold text-foreground">
                        {tire ? tire.serialNumber : log.tireId}
                      </span>
                      <StatusBadge status={log.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tire ? `${tire.model} — ${tire.size}` : "Unknown tire"}
                    </p>
                  </div>
                  <div className="text-left sm:text-right space-y-0.5 text-sm">
                    <p className="font-medium text-foreground flex items-center gap-1.5 sm:justify-end">
                      <User className="size-3.5" />
                      {log.driverName}
                    </p>
                    <p className="text-muted-foreground flex items-center gap-1.5 sm:justify-end">
                      <MapPin className="size-3.5" />
                      {log.destination}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Progress</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        log.status === "delayed"
                          ? "bg-danger"
                          : log.status === "returned"
                            ? "bg-muted-foreground"
                            : "bg-primary",
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    {DISPATCH_STATUS_ORDER.map((status) => {
                      const reached = DISPATCH_STATUS_ORDER.indexOf(status) <= DISPATCH_STATUS_ORDER.indexOf(log.status) && log.status !== "delayed" && log.status !== "returned";
                      return (
                        <span
                          key={status}
                          className={cn(
                            reached ? "text-foreground font-medium" : "",
                            "hidden sm:inline",
                          )}
                        >
                          {DISPATCH_STATUS_LABELS[status]}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {latestUpdate && (
                  <div className="rounded-xl bg-muted px-3 py-2 text-sm space-y-0.5">
                    <p className="text-foreground flex items-center gap-1.5">
                      <Clock className="size-3.5 text-primary" />
                      Latest: {DISPATCH_STATUS_LABELS[latestUpdate.status]} at {latestUpdate.location}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(latestUpdate.updatedAt).toLocaleString("en-IN")} by {latestUpdate.updatedBy}
                    </p>
                  </div>
                )}

                {isUpdating ? (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <RefreshCw className="size-4 text-primary" />
                      Update shipment status
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">New status</label>
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value as DispatchStatus)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {DISPATCH_STATUS_ORDER.map((status) => (
                            <option key={status} value={status}>
                              {DISPATCH_STATUS_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-foreground">Current location</label>
                        <input
                          type="text"
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Hosur Road"
                          className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Updated by</label>
                      <input
                        type="text"
                        value={updatedBy}
                        onChange={(e) => setUpdatedBy(e.target.value)}
                        placeholder="Driver / dispatcher name"
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground">Notes</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes"
                        rows={2}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
                    {success && (
                      <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
                        <Check className="size-4" />
                        {success}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdate(log)}
                        className="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Save update
                      </button>
                      <button
                        onClick={closeUpdateForm}
                        className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => openUpdateForm(log)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    <RefreshCw className="size-4" />
                    Update status
                  </button>
                )}

                {updates.length > 0 && (
                  <div className="pt-2 border-t border-border">
                    <button
                      onClick={() => toggleExpand(log.id)}
                      className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <ClipboardList className="size-4" />
                      {isExpanded ? "Hide history" : "View tracking history"}
                      {isExpanded ? (
                        <ChevronUp className="size-4" />
                      ) : (
                        <ChevronDown className="size-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <ol className="mt-3 space-y-3 relative pl-4 border-l border-border">
                        {updates.map((update, idx) => (
                          <li key={update.id} className="relative pl-5">
                            <span
                              className={cn(
                                "absolute -left-[21px] top-0.5 size-3 rounded-full border-2 border-card",
                                idx === 0 ? "bg-primary" : "bg-muted-foreground",
                              )}
                            />
                            <p className="text-sm text-foreground font-medium">
                              {DISPATCH_STATUS_LABELS[update.status]} — {update.location}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(update.updatedAt).toLocaleString("en-IN")} by {update.updatedBy}
                            </p>
                            {update.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{update.notes}</p>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
          <ClipboardList className="size-5 text-primary" />
          Completed shipments
        </h2>
        <CompletedShipmentsTable
          tires={tires}
          dispatchLogs={dispatchLogs.filter((l) => l.status === "delivered" || l.status === "returned")}
        />
      </div>
    </div>
  );
}

function CompletedShipmentsTable({
  tires,
  dispatchLogs,
}: {
  tires: Tire[];
  dispatchLogs: TireDispatch[];
}) {
  if (dispatchLogs.length === 0) {
    return (
      <div className="rounded-xl bg-muted p-6 text-center text-muted-foreground text-sm">
        No completed shipments yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatched</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Final status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {dispatchLogs
            .slice()
            .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
            .map((log) => {
              const tire = tires.find((t) => t.id === log.tireId);
              return (
                <tr key={log.id}>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {tire ? tire.serialNumber : log.tireId}
                  </td>
                  <td className="px-4 py-3 text-foreground">{tire ? `${tire.model} — ${tire.size}` : "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.destination}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.driverName}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(log.dispatchedAt).toLocaleString("en-IN")}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={log.status} />
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Truck;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center gap-4">
      <div className="rounded-xl bg-primary/10 p-3 text-primary">
        <Icon className="size-6" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: DispatchStatus }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  const styles: Record<DispatchStatus, string> = {
    "holding-bay": "bg-muted text-muted-foreground",
    loading: "bg-warning-soft text-warning",
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

function getNextStatus(current: DispatchStatus): DispatchStatus {
  const idx = DISPATCH_STATUS_ORDER.indexOf(current);
  if (idx >= 0 && idx < DISPATCH_STATUS_ORDER.length - 1) {
    return DISPATCH_STATUS_ORDER[idx + 1];
  }
  return current;
}

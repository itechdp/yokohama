import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  PackageCheck,
  Truck,
  User,
} from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_ORDER,
  type DispatchStatus,
  type ShipmentTrackingUpdate,
  type Tire,
  type TireDispatch,
  type TruckLoadConfirmation,
} from "@/types/tire";

export default function TireConfirmLoad() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<TireDispatch[]>([]);
  const [trackingUpdates, setTrackingUpdates] = useState<ShipmentTrackingUpdate[]>([]);
  const [loadConfirmations, setLoadConfirmations] = useState<TruckLoadConfirmation[]>([]);
  const [expandedSize, setExpandedSize] = useState<string | null>(null);

  const [confirmedBy, setConfirmedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [sizeSuccess, setSizeSuccess] = useState<string | null>(null);
  const [busySize, setBusySize] = useState<string | null>(null);

  const loadData = () => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setDispatchLogs((db.dispatchLogs as TireDispatch[]) || []);
    setTrackingUpdates((db.shipmentTrackingUpdates as ShipmentTrackingUpdate[]) || []);
    setLoadConfirmations((db.truckLoadConfirmations as TruckLoadConfirmation[]) || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const activeShipments = useMemo(
    () => dispatchLogs.filter((l) => l.status !== "delivered" && l.status !== "returned"),
    [dispatchLogs],
  );

  const groupedBySize = useMemo(() => {
    const map: Record<string, { size: string; tires: Tire[]; logs: TireDispatch[] }> = {};
    for (const log of activeShipments) {
      const tire = tires.find((t) => t.id === log.tireId);
      if (!tire) continue;
      if (!map[tire.size]) {
        map[tire.size] = { size: tire.size, tires: [], logs: [] };
      }
      map[tire.size].logs.push(log);
      map[tire.size].tires.push(tire);
    }
    return Object.values(map).sort((a, b) => a.size.localeCompare(b.size));
  }, [activeShipments, tires]);

  const latestConfirmationFor = (size: string) => {
    return loadConfirmations
      .filter((c) => c.size === size)
      .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))[0];
  };

  const toggleExpand = (size: string) => {
    setExpandedSize((prev) => (prev === size ? null : size));
  };

  const confirmableLogsForGroup = (logs: TireDispatch[]) => {
    const loadedIdx = DISPATCH_STATUS_ORDER.indexOf("loaded");
    return logs.filter(
      (l) =>
        l.status !== "loaded" &&
        DISPATCH_STATUS_ORDER.includes(l.status) &&
        DISPATCH_STATUS_ORDER.indexOf(l.status) < loadedIdx,
    );
  };

  const handleConfirmLoad = (group: { size: string; tires: Tire[]; logs: TireDispatch[] }) => {
    setSizeError(null);
    setSizeSuccess(null);

    if (!confirmedBy.trim()) {
      setSizeError("Enter who is confirming the truck load.");
      return;
    }

    const toUpdate = confirmableLogsForGroup(group.logs);
    if (toUpdate.length === 0) {
      setSizeError("All tires for this size are already loaded or beyond the loading stage.");
      return;
    }

    setBusySize(group.size);

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const trackingList: ShipmentTrackingUpdate[] = db.shipmentTrackingUpdates || [];
    const confirmationsList: TruckLoadConfirmation[] = db.truckLoadConfirmations || [];
    const historyList: unknown[] = db.tireHistory || [];
    const now = new Date().toISOString();

    const updatedIds = new Set(toUpdate.map((l) => l.id));

    const updatedLogs = logsList.map((l) =>
      updatedIds.has(l.id) ? { ...l, status: "loaded" as DispatchStatus } : l,
    );

    const newTrackingUpdates: ShipmentTrackingUpdate[] = toUpdate.map((log, i) => ({
      id: `st-${Date.now()}-${log.id}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      dispatchId: log.id,
      tireId: log.tireId,
      status: "loaded",
      location: "Loaded onto truck",
      updatedAt: now,
      updatedBy: confirmedBy.trim(),
      notes: notes.trim() || `Tire size ${group.size} loaded onto truck`,
    }));

    const newHistory: { id: string; tireId: string; stage: "dispatch"; location: string; movedAt: string; movedBy: string; notes: string }[] = toUpdate.map((log, i) => ({
      id: `h-${Date.now()}-${log.id}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: log.tireId,
      stage: "dispatch",
      location: log.destination,
      movedAt: now,
      movedBy: confirmedBy.trim(),
      notes: `Loaded onto truck — ${group.size}${notes.trim() ? ` — ${notes.trim()}` : ""}`,
    }));

    const confirmation: TruckLoadConfirmation = {
      id: `tlc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      size: group.size,
      tireIds: toUpdate.map((l) => l.tireId),
      dispatchIds: toUpdate.map((l) => l.id),
      confirmedAt: now,
      confirmedBy: confirmedBy.trim(),
      notes: notes.trim(),
    };

    const updatedTires = tiresList.map((t) => {
      if (!toUpdate.some((l) => l.tireId === t.id)) return t;
      return { ...t, updatedAt: now };
    });

    const updatedDb = {
      ...db,
      tires: updatedTires,
      dispatchLogs: updatedLogs,
      shipmentTrackingUpdates: [...trackingList, ...newTrackingUpdates],
      truckLoadConfirmations: [...confirmationsList, confirmation],
      tireHistory: [...historyList, ...newHistory],
    };

    writeDb(updatedDb);
    setTires(updatedTires);
    setDispatchLogs(updatedLogs);
    setTrackingUpdates(updatedDb.shipmentTrackingUpdates as ShipmentTrackingUpdate[]);
    setLoadConfirmations(updatedDb.truckLoadConfirmations as TruckLoadConfirmation[]);

    setNotes("");
    setConfirmedBy("");
    setBusySize(null);
    setSizeSuccess(`Confirmed ${toUpdate.length} tire${toUpdate.length === 1 ? "" : "s"} of size ${group.size} loaded onto the truck.`);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <PackageCheck className="size-6 text-primary" />
            Confirm truck load
          </h1>
          <p className="text-muted-foreground">
            For each tire size still awaiting pickup, confirm when it has been successfully loaded onto the truck.
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={PackageCheck}
          label="Pending sizes"
          value={groupedBySize.length.toString()}
        />
        <StatCard
          icon={Truck}
          label="Active shipments"
          value={activeShipments.length.toString()}
        />
        <StatCard
          icon={Check}
          label="Loaded today"
          value={loadConfirmations
            .filter((c) => new Date(c.confirmedAt).toDateString() === new Date().toDateString())
            .length.toString()}
        />
        <StatCard
          icon={ClipboardList}
          label="Total confirmations"
          value={loadConfirmations.length.toString()}
        />
      </div>

      {groupedBySize.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
          No active dispatches are waiting to be loaded onto a truck.
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {groupedBySize.map((group) => {
            const isExpanded = expandedSize === group.size;
            const confirmable = confirmableLogsForGroup(group.logs);
            const alreadyLoadedCount = group.logs.length - confirmable.length;
            const latest = latestConfirmationFor(group.size);
            const drivers = Array.from(new Set(group.logs.map((l) => l.driverName))).sort();
            const destinations = Array.from(new Set(group.logs.map((l) => l.destination))).sort();
            const models = Array.from(new Set(group.tires.map((t) => t.model))).sort();

            return (
              <div
                key={group.size}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-semibold text-foreground">{group.size}</span>
                      {confirmable.length === 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-success-soft text-success">
                          <Check className="size-3.5" />
                          Loaded
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                          <Truck className="size-3.5" />
                          Awaiting load
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {models.join(", ")}
                    </p>
                  </div>
                  <div className="text-left sm:text-right space-y-0.5 text-sm">
                    <p className="font-medium text-foreground">{group.logs.length} tire{group.logs.length === 1 ? "" : "s"}</p>
                    {alreadyLoadedCount > 0 && (
                      <p className="text-muted-foreground">{alreadyLoadedCount} already loaded</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-muted-foreground text-xs">Driver{drivers.length === 1 ? "" : "s"}</p>
                    <p className="text-foreground font-medium">{drivers.join(", ") || "—"}</p>
                  </div>
                  <div className="rounded-xl bg-muted px-3 py-2">
                    <p className="text-muted-foreground text-xs">Destination{destinations.length === 1 ? "" : "s"}</p>
                    <p className="text-foreground font-medium">{destinations.join(", ") || "—"}</p>
                  </div>
                </div>

                {latest && (
                  <div className="rounded-xl bg-info-soft px-3 py-2 text-sm">
                    <p className="text-info flex items-center gap-1.5">
                      <Check className="size-3.5" />
                      Last confirmed by {latest.confirmedBy} at{" "}
                      {new Date(latest.confirmedAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                )}

                {confirmable.length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                      <PackageCheck className="size-4 text-primary" />
                      Confirm load
                    </h3>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <User className="size-3.5 text-muted-foreground" />
                        Confirmed by
                      </label>
                      <input
                        type="text"
                        value={confirmedBy}
                        onChange={(e) => setConfirmedBy(e.target.value)}
                        placeholder="Loader / supervisor name"
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <ClipboardList className="size-3.5 text-muted-foreground" />
                        Notes
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional load notes, e.g. truck plate or bay number"
                        rows={2}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>

                    {sizeError && (
                      <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger flex items-center gap-2">
                        <AlertCircle className="size-4" />
                        {sizeError}
                      </div>
                    )}
                    {sizeSuccess && (
                      <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
                        <Check className="size-4" />
                        {sizeSuccess}
                      </div>
                    )}

                    <button
                      onClick={() => handleConfirmLoad(group)}
                      disabled={busySize === group.size}
                      className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {busySize === group.size
                        ? "Confirming…"
                        : `Confirm ${confirmable.length} tire${confirmable.length === 1 ? "" : "s"} loaded`}
                    </button>
                  </div>
                )}

                <div className="pt-2 border-t border-border">
                  <button
                    onClick={() => toggleExpand(group.size)}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <ClipboardList className="size-4" />
                    {isExpanded ? "Hide tire list" : "View tires"}
                    {isExpanded ? (
                      <ChevronUp className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="mt-3 overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Serial</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Driver</th>
                            <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {group.logs.map((log) => {
                            const tire = group.tires.find((t) => t.id === log.tireId);
                            return (
                              <tr key={log.id}>
                                <td className="px-3 py-2 font-medium text-foreground">
                                  {tire?.serialNumber || log.tireId}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {tire ? `${tire.model}` : "—"}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">{log.driverName}</td>
                                <td className="px-3 py-2">
                                  <StatusBadge status={log.status} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
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

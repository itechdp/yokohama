import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertCircle,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock,
  Factory,
  MapPin,
  Package,
  PackageCheck,
  Search,
  Timer,
  Truck,
  Warehouse,
  Workflow,
} from "lucide-react";
import { readDb } from "@/lib/db";
import { cn, formatInr } from "@/lib/utils";
import {
  DELIVERY_PROGRESS,
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_ORDER,
  STAGE_LABELS,
  STAGE_ORDER,
  type DispatchStatus,
  type ShipmentTrackingUpdate,
  type StageHistory,
  type Tire,
  type TireDispatch,
  type TireStage,
} from "@/types/tire";

const STAGE_ICON: Record<TireStage, typeof Factory> = {
  production: Factory,
  "quality-check": PackageCheck,
  warehouse: Warehouse,
  dispatch: Truck,
  dealer: MapPin,
  mounted: CheckCircle2,
  retread: Timer,
  scrapped: AlertCircle,
};

export default function TireProcess() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [history, setHistory] = useState<StageHistory[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<TireDispatch[]>([]);
  const [trackingUpdates, setTrackingUpdates] = useState<ShipmentTrackingUpdate[]>([]);
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<TireStage | null>(null);
  const [expandedTireId, setExpandedTireId] = useState<string | null>(null);

  const loadData = () => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setHistory((db.tireHistory as StageHistory[]) || []);
    setDispatchLogs((db.dispatchLogs as TireDispatch[]) || []);
    setTrackingUpdates((db.shipmentTrackingUpdates as ShipmentTrackingUpdate[]) || []);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const stageCounts = useMemo(() => {
    const counts: Record<TireStage, number> = {
      production: 0,
      "quality-check": 0,
      warehouse: 0,
      dispatch: 0,
      dealer: 0,
      mounted: 0,
      retread: 0,
      scrapped: 0,
    };
    for (const tire of tires) {
      counts[tire.currentStage]++;
    }
    return STAGE_ORDER.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: counts[stage],
    }));
  }, [tires]);

  const stats = useMemo(() => {
    const total = tires.length;
    const pipeline = tires.filter(
      (t) =>
        t.currentStage === "production" ||
        t.currentStage === "quality-check" ||
        t.currentStage === "warehouse" ||
        t.currentStage === "dispatch" ||
        t.currentStage === "dealer",
    ).length;
    const completed = tires.filter(
      (t) => t.currentStage === "dealer" || t.currentStage === "mounted",
    ).length;
    const avgLeadTime = computeAvgLeadTimeToDispatch(tires, history);
    return { total, pipeline, completed, avgLeadTime };
  }, [tires, history]);

  const filteredTires = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tires.filter((t) => {
      const matchesSearch =
        !q ||
        t.serialNumber.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.size.toLowerCase().includes(q) ||
        t.location.toLowerCase().includes(q);
      const matchesStage = !selectedStage || t.currentStage === selectedStage;
      return matchesSearch && matchesStage;
    });
  }, [tires, search, selectedStage]);

  const toggleExpand = (id: string) => {
    setExpandedTireId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Workflow className="size-6 text-primary" />
            Process tracking
          </h1>
          <p className="text-muted-foreground">
            End-to-end view of every tire from production through final dispatch.
          </p>
        </div>
        <Link
          to="/tires"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          <Box className="size-4" />
          Tire inventory
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Package} label="Total tires" value={stats.total.toString()} />
        <StatCard icon={Clock} label="In pipeline" value={stats.pipeline.toString()} />
        <StatCard icon={CheckCircle2} label="Reached customer" value={stats.completed.toString()} />
        <StatCard icon={Timer} label="Avg. lead time to dispatch" value={stats.avgLeadTime} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {stageCounts.map(({ stage, label, count }) => {
          const percentage = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
          const Icon = STAGE_ICON[stage];
          const isSelected = selectedStage === stage;
          return (
            <button
              key={stage}
              onClick={() => setSelectedStage((prev) => (prev === stage ? null : stage))}
              className={cn(
                "text-left rounded-2xl border p-4 shadow-sm transition-all",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground ring-2 ring-ring"
                  : "border-border bg-card hover:border-primary/50",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div
                  className={cn(
                    "rounded-xl p-2 shrink-0",
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  <Icon className="size-5" />
                </div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                    isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {percentage}%
                </span>
              </div>
              <p
                className={cn(
                  "mt-3 text-2xl font-semibold",
                  isSelected ? "text-primary-foreground" : "text-foreground",
                )}
              >
                {count}
              </p>
              <p className={cn("text-sm", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                {label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <h2 className="text-lg font-medium text-foreground mb-4">Process flow by stage</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={stageCounts}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 16, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                allowDecimals={false}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={110}
                tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
              />
              <Tooltip
                cursor={{ fill: "hsl(var(--muted))" }}
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.75rem",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                itemStyle={{ color: "hsl(var(--primary))" }}
              />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} animationDuration={1200} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by serial, model, size or location"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {selectedStage && (
            <button
              onClick={() => setSelectedStage(null)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Clear stage filter
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Current stage</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dwell time</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTires.map((tire) => {
                const expanded = expandedTireId === tire.id;
                return (
                  <ProcessRow
                    key={tire.id}
                    tire={tire}
                    expanded={expanded}
                    history={history.filter((h) => h.tireId === tire.id)}
                    dispatchLogs={dispatchLogs.filter((d) => d.tireId === tire.id)}
                    trackingUpdates={trackingUpdates.filter((u) => u.tireId === tire.id)}
                    onToggle={() => toggleExpand(tire.id)}
                  />
                );
              })}
              {filteredTires.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                    No tires match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Package;
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

function ProcessRow({
  tire,
  expanded,
  history,
  dispatchLogs,
  trackingUpdates,
  onToggle,
}: {
  tire: Tire;
  expanded: boolean;
  history: StageHistory[];
  dispatchLogs: TireDispatch[];
  trackingUpdates: ShipmentTrackingUpdate[];
  onToggle: () => void;
}) {
  const dwell = useMemo(() => computeDwellTime(tire, history), [tire, history]);

  return (
    <>
      <tr className="hover:bg-muted/50 transition-colors">
        <td className="px-4 py-3 font-medium text-foreground">{tire.serialNumber}</td>
        <td className="px-4 py-3 text-foreground">{tire.model}</td>
        <td className="px-4 py-3 text-muted-foreground">{tire.size}</td>
        <td className="px-4 py-3">
          <StageBadge stage={tire.currentStage} />
        </td>
        <td className="px-4 py-3 text-muted-foreground">{tire.location}</td>
        <td className="px-4 py-3 text-muted-foreground">{dwell}</td>
        <td className="px-4 py-3 text-foreground">{formatInr(tire.costPrice)}</td>
        <td className="px-4 py-3">
          <button
            onClick={onToggle}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {expanded ? (
              <>
                Hide journey <ChevronUp className="size-4" />
              </>
            ) : (
              <>
                View journey <ChevronDown className="size-4" />
              </>
            )}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className="px-4 py-0">
            <div className="rounded-xl bg-muted/40 border border-border p-4 my-3">
              <ProcessTimeline
                tire={tire}
                history={history}
                dispatchLogs={dispatchLogs}
                trackingUpdates={trackingUpdates}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ProcessTimeline({
  tire,
  history,
  dispatchLogs,
  trackingUpdates,
}: {
  tire: Tire;
  history: StageHistory[];
  dispatchLogs: TireDispatch[];
  trackingUpdates: ShipmentTrackingUpdate[];
}) {
  const currentIndex = STAGE_ORDER.indexOf(tire.currentStage);
  const latestDispatch = useMemo(
    () =>
      dispatchLogs
        .slice()
        .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))[0] || null,
    [dispatchLogs],
  );

  const stageHistoryByStage = useMemo(() => {
    const map: Record<TireStage, StageHistory[]> = {
      production: [],
      "quality-check": [],
      warehouse: [],
      dispatch: [],
      dealer: [],
      mounted: [],
      retread: [],
      scrapped: [],
    };
    for (const entry of history) {
      if (!map[entry.stage]) map[entry.stage] = [];
      map[entry.stage].push(entry);
    }
    for (const stage of STAGE_ORDER) {
      map[stage].sort((a, b) => a.movedAt.localeCompare(b.movedAt));
    }
    return map;
  }, [history]);

  const visibleStages = useMemo(() => {
    if (tire.currentStage === "scrapped") {
      return STAGE_ORDER.slice(0, currentIndex + 1);
    }
    return STAGE_ORDER.slice(0, currentIndex + 1);
  }, [tire.currentStage, currentIndex]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardList className="size-5 text-primary" />
        <h3 className="text-base font-medium text-foreground">
          Journey for {tire.serialNumber}
        </h3>
      </div>
      <ol className="relative pl-4 border-l border-border space-y-6">
        {visibleStages.map((stage) => {
          const entries = stageHistoryByStage[stage] || [];
          const entry = entries[entries.length - 1];
          const isActive = stage === tire.currentStage;
          const Icon = STAGE_ICON[stage];

          return (
            <li key={stage} className="relative pl-6">
              <span
                className={cn(
                  "absolute -left-[21px] top-0.5 size-3 rounded-full border-2 border-card",
                  isActive ? "bg-primary" : "bg-muted-foreground",
                )}
              />
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Icon className="size-3.5 text-primary" />
                    {STAGE_LABELS[stage]}
                    {isActive && (
                      <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Current
                      </span>
                    )}
                  </p>
                  {entry ? (
                    <>
                      <p className="text-sm text-foreground">
                        {entry.location}
                        {entry.notes ? ` • ${entry.notes}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(entry.movedAt).toLocaleString("en-IN")}
                        {entry.movedBy ? ` by ${entry.movedBy}` : ""}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No movement recorded</p>
                  )}
                </div>
                {stage === "dispatch" && latestDispatch && (
                  <DispatchSummary log={latestDispatch} />
                )}
              </div>

              {stage === "dispatch" && latestDispatch && (
                <DispatchSubTimeline
                  log={latestDispatch}
                  updates={trackingUpdates.filter((u) => u.dispatchId === latestDispatch.id)}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DispatchSummary({ log }: { log: TireDispatch }) {
  const progress = DELIVERY_PROGRESS[log.status] ?? 0;
  return (
    <div className="sm:text-right space-y-1 min-w-[10rem]">
      <p className="text-sm font-medium text-foreground">{log.destination}</p>
      <p className="text-xs text-muted-foreground">Driver: {log.driverName}</p>
      <p className="text-xs font-medium text-primary">{DISPATCH_STATUS_LABELS[log.status]}</p>
      <div className="h-1.5 w-full sm:w-32 rounded-full bg-muted overflow-hidden ml-auto">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            log.status === "delayed" || log.status === "returned" ? "bg-danger" : "bg-primary",
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function DispatchSubTimeline({
  log,
  updates,
}: {
  log: TireDispatch;
  updates: ShipmentTrackingUpdate[];
}) {
  const sorted = useMemo(
    () => updates.slice().sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()),
    [updates],
  );

  const currentStatus = log.status;
  return (
    <div className="mt-4 pl-2 sm:pl-6">
      <div className="flex flex-wrap items-center gap-2">
        {DISPATCH_STATUS_ORDER.map((status) => {
          const reached =
            sorted.some((u) => u.status === status) ||
            (currentStatus === status && sorted.some((u) => u.status === status));
          const isCurrent = currentStatus === status;
          return (
            <div
              key={status}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border",
                reached
                  ? isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-success bg-success-soft text-success"
                  : "border-border bg-card text-muted-foreground",
              )}
            >
              {reached && !isCurrent ? <CheckCircle2 className="size-3" /> : <Truck className="size-3" />}
              {DISPATCH_STATUS_LABELS[status]}
            </div>
          );
        })}
        {(currentStatus === "delayed" || currentStatus === "returned") && (
          <StatusChip status={currentStatus} />
        )}
      </div>

      {sorted.length > 0 && (
        <ol className="mt-3 relative pl-3 border-l border-border space-y-3">
          {sorted.map((update, idx) => (
            <li key={update.id} className="relative pl-4">
              <span
                className={cn(
                  "absolute -left-[15px] top-0.5 size-2 rounded-full",
                  idx === sorted.length - 1 ? "bg-primary" : "bg-muted-foreground",
                )}
              />
              <p className="text-sm text-foreground">
                {DISPATCH_STATUS_LABELS[update.status]} — {update.location}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(update.updatedAt).toLocaleString("en-IN")}
                {update.updatedBy ? ` by ${update.updatedBy}` : ""}
              </p>
              {update.notes && <p className="text-xs text-muted-foreground mt-0.5">{update.notes}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: DispatchStatus }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border";
  const styles: Record<DispatchStatus, string> = {
    "picked-up": "border-info bg-info-soft text-info",
    loaded: "border-info bg-info-soft text-info",
    "in-transit": "border-info bg-info-soft text-info",
    "at-hub": "border-warning bg-warning-soft text-warning",
    "out-for-delivery": "border-warning bg-warning-soft text-warning",
    delivered: "border-success bg-success-soft text-success",
    delayed: "border-danger bg-danger-soft text-danger",
    returned: "border-danger bg-danger-soft text-danger",
  };
  return (
    <span className={cn(base, styles[status])}>
      <AlertCircle className="size-3" />
      {DISPATCH_STATUS_LABELS[status]}
    </span>
  );
}

function StageBadge({ stage }: { stage: TireStage }) {
  const base = "inline-flex rounded-full px-2 py-0.5 text-xs font-medium";
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

function computeDwellTime(tire: Tire, history: StageHistory[]): string {
  const currentHistory = history
    .filter((h) => h.stage === tire.currentStage)
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt))[0];

  const since = currentHistory ? new Date(currentHistory.movedAt).getTime() : new Date(tire.updatedAt).getTime();
  const ms = Date.now() - since;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(ms / 3600000);
  const days = Math.floor(ms / 86400000);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function computeAvgLeadTimeToDispatch(tires: Tire[], history: StageHistory[]): string {
  const leadTimes: number[] = [];
  for (const tire of tires) {
    if (
      tire.currentStage !== "dispatch" &&
      tire.currentStage !== "dealer" &&
      tire.currentStage !== "mounted" &&
      tire.currentStage !== "scrapped"
    ) {
      continue;
    }
    const production = history
      .filter((h) => h.tireId === tire.id && h.stage === "production")
      .sort((a, b) => a.movedAt.localeCompare(b.movedAt))[0];
    const dispatch = history
      .filter((h) => h.tireId === tire.id && h.stage === "dispatch")
      .sort((a, b) => a.movedAt.localeCompare(b.movedAt))[0];

    const start = production ? new Date(production.movedAt).getTime() : new Date(tire.productionDate).getTime();
    const end = dispatch ? new Date(dispatch.movedAt).getTime() : null;
    if (!end) continue;
    leadTimes.push(end - start);
  }

  if (leadTimes.length === 0) return "—";
  const avgMs = leadTimes.reduce((sum, ms) => sum + ms, 0) / leadTimes.length;
  const avgDays = avgMs / 86400000;
  return `${avgDays.toFixed(1)} days`;
}

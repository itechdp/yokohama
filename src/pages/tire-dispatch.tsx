import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  MapPin,
  Package,
  PackageCheck,
  Plus,
  Search,
  Truck,
  User,
} from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  DISPATCH_STATUS_LABELS,
  type DispatchPlan,
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

interface TireGroup {
  key: string;
  model: string;
  material?: string;
  brand?: string;
  plyRatingBottom?: string;
  tireIds: string[];
}

export default function TireDispatch() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [dispatchLogs, setDispatchLogs] = useState<TireDispatch[]>([]);
  const [plans, setPlans] = useState<DispatchPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const loadData = () => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setDispatchLogs((db.dispatchLogs as TireDispatch[]) || []);
    setPlans((db.dispatchPlans as DispatchPlan[]) || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openPlans = useMemo(() => plans.filter((p) => p.status === "open"), [plans]);
  const dispatchedPlans = useMemo(() => plans.filter((p) => p.status === "dispatched"), [plans]);
  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || null;

  if (selectedPlan) {
    return (
      <PlanDetail
        plan={selectedPlan}
        tires={tires}
        dispatchLogs={dispatchLogs}
        onBack={() => setSelectedPlanId(null)}
        onRefresh={loadData}
      />
    );
  }

  return (
    <PlanList
      openPlans={openPlans}
      dispatchedPlans={dispatchedPlans}
      onSelect={setSelectedPlanId}
      onCreated={(planId) => {
        loadData();
        setSelectedPlanId(planId);
      }}
    />
  );
}

function PlanList({
  openPlans,
  dispatchedPlans,
  onSelect,
  onCreated,
}: {
  openPlans: DispatchPlan[];
  dispatchedPlans: DispatchPlan[];
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(openPlans.length === 0);
  const [driverName, setDriverName] = useState("");
  const [destination, setDestination] = useState("");
  const [otherDestination, setOtherDestination] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleDestinationChange = (value: string) => {
    setDestination(value);
    if (value !== "Other") setOtherDestination("");
  };

  const finalDestination = destination === "Other" ? otherDestination.trim() : destination;

  const handleCreate = () => {
    setError(null);
    if (!driverName.trim()) {
      setError("Enter the driver name.");
      return;
    }
    if (!finalDestination) {
      setError("Choose a destination.");
      return;
    }
    if (!truckNumber.trim()) {
      setError("Enter the truck number.");
      return;
    }
    if (!createdBy.trim()) {
      setError("Enter who is creating this plan.");
      return;
    }

    const db = readDb();
    const plansList: DispatchPlan[] = db.dispatchPlans || [];
    const now = new Date().toISOString();
    const plan: DispatchPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      driverName: driverName.trim(),
      destination: finalDestination,
      truckNumber: truckNumber.trim(),
      createdAt: now,
      createdBy: createdBy.trim(),
      notes: notes.trim(),
      status: "open",
    };

    writeDb({ ...db, dispatchPlans: [...plansList, plan] });
    onCreated(plan.id);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Truck className="size-6 text-primary" />
            Dispatch tires
          </h1>
          <p className="text-muted-foreground">
            Pick an open plan to keep loading it, or create a new truck/destination plan.
          </p>
        </div>
        <Link
          to="/tires"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Back to inventory
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {openPlans.map((plan) => (
          <button
            key={plan.id}
            onClick={() => onSelect(plan.id)}
            className="text-left rounded-2xl border border-border bg-card p-5 shadow-sm hover:border-primary transition-colors"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                <Truck className="size-4 text-primary" />
                {plan.truckNumber}
              </span>
              <span className="inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning">
                Open
              </span>
            </div>
            <p className="mt-2 text-sm text-foreground flex items-center gap-1.5">
              <MapPin className="size-3.5 text-muted-foreground" />
              {plan.destination}
            </p>
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="size-3.5" />
              {plan.driverName}
            </p>
          </button>
        ))}

        <button
          onClick={() => setShowForm(true)}
          className={cn(
            "flex items-center justify-center gap-2 rounded-2xl border border-dashed p-5 text-sm font-medium transition-colors",
            "border-border text-muted-foreground hover:border-primary hover:text-primary",
          )}
        >
          <Plus className="size-4" />
          Create new plan
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4 max-w-xl">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <Truck className="size-5 text-primary" />
            New dispatch plan
          </h2>

          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Truck className="size-4 text-muted-foreground" />
              Truck number
            </label>
            <input
              type="text"
              value={truckNumber}
              onChange={(e) => setTruckNumber(e.target.value)}
              placeholder="e.g. KA 01 AB 1234"
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

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
              Created by
            </label>
            <input
              type="text"
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
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
              placeholder="Optional notes"
              rows={2}
              className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}

          <button
            onClick={handleCreate}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Create plan
          </button>
        </div>
      )}

      {dispatchedPlans.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-3">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Dispatched trucks
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Truck</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Destination</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Dispatched at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dispatchedPlans
                  .slice()
                  .sort((a, b) => (b.dispatchedAt || "").localeCompare(a.dispatchedAt || ""))
                  .map((plan) => (
                    <tr key={plan.id}>
                      <td className="px-4 py-3 font-medium text-foreground">{plan.truckNumber}</td>
                      <td className="px-4 py-3 text-foreground">{plan.destination}</td>
                      <td className="px-4 py-3 text-muted-foreground">{plan.driverName}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {plan.dispatchedAt ? new Date(plan.dispatchedAt).toLocaleString("en-IN") : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PlanDetail({
  plan,
  tires,
  dispatchLogs,
  onBack,
  onRefresh,
}: {
  plan: DispatchPlan;
  tires: Tire[];
  dispatchLogs: TireDispatch[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedQty, setSelectedQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const planLogs = useMemo(
    () => dispatchLogs.filter((l) => l.planId === plan.id),
    [dispatchLogs, plan.id],
  );

  // Tires already committed to any active (non-delivered/returned) dispatch, so they
  // can't be double-added to another plan.
  const activelyDispatchedIds = useMemo(
    () => new Set(dispatchLogs.filter((l) => l.status !== "delivered" && l.status !== "returned").map((l) => l.tireId)),
    [dispatchLogs],
  );

  const candidates = useMemo(
    () => tires.filter((t) => t.currentStage === "warehouse" && !activelyDispatchedIds.has(t.id)),
    [tires, activelyDispatchedIds],
  );

  const groups = useMemo(() => {
    const map = new Map<string, TireGroup>();
    for (const t of candidates) {
      const key = t.model;
      const existing = map.get(key);
      if (existing) existing.tireIds.push(t.id);
      else
        map.set(key, {
          key,
          model: t.model,
          material: t.serialNumber,
          brand: t.brand,
          plyRatingBottom: t.plyRatingBottom,
          tireIds: [t.id],
        });
    }
    return Array.from(map.values()).sort((a, b) => a.model.localeCompare(b.model));
  }, [candidates]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => [g.model, g.material, g.brand, g.plyRatingBottom].some((v) => v?.toLowerCase().includes(q)));
  }, [groups, search]);

  const selectedGroups = useMemo(() => groups.filter((g) => g.key in selectedQty), [groups, selectedQty]);

  const toggleGroup = (key: string) => {
    setSelectedQty((prev) => {
      const next = { ...prev };
      if (key in next) delete next[key];
      else next[key] = "1";
      return next;
    });
  };

  const updateQty = (key: string, value: string) => {
    setSelectedQty((prev) => ({ ...prev, [key]: value.replace(/\D/g, "") }));
  };

  const handleAddToPlan = () => {
    setError(null);
    setSuccess(null);

    if (selectedGroups.length === 0) {
      setError("Select at least one tire.");
      return;
    }
    for (const g of selectedGroups) {
      const qty = Number.parseInt(selectedQty[g.key] || "0", 10);
      if (Number.isNaN(qty) || qty < 1) {
        setError(`Enter a valid quantity for ${g.model}.`);
        return;
      }
      if (qty > g.tireIds.length) {
        setError(`Only ${g.tireIds.length} available for ${g.model}.`);
        return;
      }
    }

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const now = new Date().toISOString();

    const chosenIds: string[] = [];
    for (const g of selectedGroups) {
      const qty = Number.parseInt(selectedQty[g.key] || "0", 10);
      chosenIds.push(...g.tireIds.slice(0, qty));
    }
    const chosenSet = new Set(chosenIds);

    const updatedTires = tiresList.map((t) =>
      chosenSet.has(t.id)
        ? { ...t, currentStage: "dispatch" as const, location: plan.destination, updatedAt: now }
        : t,
    );

    const newLogs: TireDispatch[] = chosenIds.map((tireId, i) => ({
      id: `d-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      planId: plan.id,
      driverName: plan.driverName,
      destination: plan.destination,
      dispatchedAt: now,
      dispatchedBy: plan.createdBy,
      status: "holding-bay",
      notes: "",
    }));

    const newHistory: StageHistory[] = chosenIds.map((tireId, i) => ({
      id: `h-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId,
      stage: "dispatch",
      location: plan.destination,
      movedAt: now,
      movedBy: plan.createdBy,
      notes: `Added to truck ${plan.truckNumber} plan — holding in bay`,
    }));

    writeDb({
      ...db,
      tires: updatedTires,
      dispatchLogs: [...logsList, ...newLogs],
      tireHistory: [...historyList, ...newHistory],
    });

    setSelectedQty({});
    setSuccess(`${chosenIds.length} tire${chosenIds.length === 1 ? "" : "s"} added to this plan.`);
    onRefresh();
  };

  const advanceStatus = (log: TireDispatch) => {
    const next: Partial<Record<DispatchStatus, DispatchStatus>> = {
      "holding-bay": "loading",
      loading: "loaded",
    };
    const nextStatus = next[log.status];
    if (!nextStatus) return;

    const db = readDb();
    const logsList: TireDispatch[] = db.dispatchLogs || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const trackingList: ShipmentTrackingUpdate[] = db.shipmentTrackingUpdates || [];
    const now = new Date().toISOString();

    const updatedLogs = logsList.map((l) => (l.id === log.id ? { ...l, status: nextStatus } : l));

    const newHistory: StageHistory = {
      id: `h-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: log.tireId,
      stage: "dispatch",
      location: plan.destination,
      movedAt: now,
      movedBy: plan.createdBy,
      notes: `${DISPATCH_STATUS_LABELS[nextStatus]} — truck ${plan.truckNumber}`,
    };

    const newTracking: ShipmentTrackingUpdate = {
      id: `st-${Date.now()}-${log.id}-${Math.random().toString(36).slice(2, 7)}`,
      dispatchId: log.id,
      tireId: log.tireId,
      status: nextStatus,
      location: plan.destination,
      updatedAt: now,
      updatedBy: plan.createdBy,
      notes: "",
    };

    writeDb({
      ...db,
      dispatchLogs: updatedLogs,
      tireHistory: [...historyList, newHistory],
      shipmentTrackingUpdates: [...trackingList, newTracking],
    });

    onRefresh();
  };

  const handleDispatchTruck = () => {
    const db = readDb();
    const plansList: DispatchPlan[] = db.dispatchPlans || [];
    const now = new Date().toISOString();
    const updatedPlans = plansList.map((p) => (p.id === plan.id ? { ...p, status: "dispatched" as const, dispatchedAt: now } : p));
    writeDb({ ...db, dispatchPlans: updatedPlans });
    onRefresh();
    onBack();
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to plans
        </button>
        {plan.status === "open" && (
          <button
            onClick={handleDispatchTruck}
            disabled={planLogs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Truck className="size-4" />
            Dispatch truck
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
        <div className="flex items-center gap-2">
          <Truck className="size-5 text-primary" />
          <span className="text-lg font-semibold text-foreground">{plan.truckNumber}</span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              plan.status === "open" ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
            )}
          >
            {plan.status === "open" ? "Open" : "Dispatched"}
          </span>
        </div>
        <p className="text-sm text-foreground flex items-center gap-1.5">
          <MapPin className="size-3.5 text-muted-foreground" /> {plan.destination}
        </p>
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <User className="size-3.5" /> {plan.driverName} · Created by {plan.createdBy}
        </p>
      </div>

      {plan.status === "open" && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <h2 className="text-base font-medium text-foreground">Add tires to this plan</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by model, material, or brand"
              className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {filteredGroups.length === 0 ? (
            <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
              {groups.length === 0 ? "No warehouse tires available to dispatch." : "No matches."}
            </div>
          ) : (
            <ul className="space-y-2 max-h-72 overflow-y-auto">
              {filteredGroups.map((g) => {
                const isSelected = g.key in selectedQty;
                return (
                  <li
                    key={g.key}
                    className={cn(
                      "rounded-xl border px-4 py-3 text-sm transition-colors",
                      isSelected ? "border-primary bg-primary/5" : "border-border bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex flex-1 items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGroup(g.key)}
                          className="size-4 rounded border-border text-primary focus:ring-ring"
                        />
                        <div>
                          <p className="font-medium text-foreground">{g.model}</p>
                          <p className="text-xs text-muted-foreground">
                            {[g.material, g.brand, g.plyRatingBottom].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </label>
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary shrink-0">
                        {g.tireIds.length} available
                      </span>
                    </div>
                    {isSelected && (
                      <div className="mt-2 pl-7">
                        <input
                          type="number"
                          min={1}
                          max={g.tireIds.length}
                          value={selectedQty[g.key]}
                          onChange={(e) => updateQty(g.key, e.target.value)}
                          className="w-28 rounded-lg border border-border bg-card px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {error && <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>}
          {success && (
            <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
              <Check className="size-4" /> {success}
            </div>
          )}

          <button
            onClick={handleAddToPlan}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Add to plan
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
        <h2 className="text-base font-medium text-foreground flex items-center gap-2">
          <PackageCheck className="size-4 text-primary" />
          Tires in this plan ({planLogs.length})
        </h2>
        {planLogs.length === 0 ? (
          <div className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">
            No tires added yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Serial</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {planLogs.map((log) => {
                  const tire = tires.find((t) => t.id === log.tireId);
                  const canAdvance = log.status === "holding-bay" || log.status === "loading";
                  return (
                    <tr key={log.id}>
                      <td className="px-3 py-2 font-medium text-foreground">{tire?.serialNumber || log.tireId}</td>
                      <td className="px-3 py-2 text-muted-foreground">{tire?.model || "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={log.status} />
                      </td>
                      <td className="px-3 py-2">
                        {canAdvance ? (
                          <button
                            onClick={() => advanceStatus(log)}
                            className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Package className="size-3.5" />
                            {log.status === "holding-bay" ? "Start loading" : "Mark loaded"}
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
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Once tires are loaded, use{" "}
        <Link to="/tires/confirm-load" className="underline">
          Confirm truck load
        </Link>{" "}
        or{" "}
        <Link to="/tires/shipment-tracking" className="underline">
          Delivery tracking
        </Link>{" "}
        to progress them further (picked up, in transit, delivered).
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: DispatchStatus }) {
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  const styles: Record<DispatchStatus, string> = {
    "holding-bay": "bg-muted text-muted-foreground",
    loading: "bg-warning-soft text-warning",
    loaded: "bg-info-soft text-info",
    "picked-up": "bg-info-soft text-info",
    "in-transit": "bg-info-soft text-info",
    "at-hub": "bg-warning-soft text-warning",
    "out-for-delivery": "bg-warning-soft text-warning",
    delivered: "bg-success-soft text-success",
    delayed: "bg-danger-soft text-danger",
    returned: "bg-danger-soft text-danger",
  };
  return <span className={cn(base, styles[status])}>{DISPATCH_STATUS_LABELS[status]}</span>;
}

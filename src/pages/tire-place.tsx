import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { Check, ClipboardList, Hash, MapPin, PackageCheck, Ruler, User } from "lucide-react";
import { readDb, writeDb } from "@/lib/db";
import { cn } from "@/lib/utils";
import { type PlacementLog, type StageHistory, type Tire } from "@/types/tire";

const STORAGE_LOCATIONS = [
  "Rack A1",
  "Rack A2",
  "Rack B1",
  "Rack B2",
  "Floor Bay 1",
  "Floor Bay 2",
  "Floor Bay 3",
  "Dispatch Dock",
];

export default function TirePlace() {
  const [tires, setTires] = useState<Tire[]>([]);
  const [placementLogs, setPlacementLogs] = useState<PlacementLog[]>([]);

  const [size, setSize] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [location, setLocation] = useState("");
  const [placedBy, setPlacedBy] = useState("");
  const [notes, setNotes] = useState("");

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const db = readDb();
    setTires((db.tires as Tire[]) || []);
    setPlacementLogs((db.placementLogs as PlacementLog[]) || []);
  }, []);

  const candidates = useMemo(() => {
    return tires.filter((t) => t.currentStage === "warehouse");
  }, [tires]);

  const availability = useMemo(() => {
    const map = new Map<string, number>();
    for (const tire of candidates) {
      map.set(tire.size, (map.get(tire.size) || 0) + 1);
    }
    return map;
  }, [candidates]);

  const sizes = useMemo(() => Array.from(availability.keys()).sort(), [availability]);

  const availableForSize = availability.get(size) || 0;

  const handleQuantityChange = (value: string) => {
    const digits = value.replace(/\D/g, "");
    setQuantity(digits);
  };

  const handlePlace = () => {
    setError(null);
    setSuccess(false);

    if (!size) {
      setError("Select a tire size.");
      return;
    }

    const qty = Number.parseInt(quantity || "0", 10);
    if (Number.isNaN(qty) || qty < 1) {
      setError("Enter a valid quantity of at least 1.");
      return;
    }

    if (qty > availableForSize) {
      setError(`Only ${availableForSize} tire${availableForSize === 1 ? "" : "s"} of size ${size} are available.`);
      return;
    }

    if (!location.trim()) {
      setError("Choose a storage location.");
      return;
    }

    if (!placedBy.trim()) {
      setError("Enter the person placing the tires.");
      return;
    }

    const chosen = candidates.filter((t) => t.size === size).slice(0, qty);
    const chosenIds = new Set(chosen.map((t) => t.id));

    const db = readDb();
    const tiresList: Tire[] = db.tires || [];
    const historyList: StageHistory[] = db.tireHistory || [];
    const logsList: PlacementLog[] = db.placementLogs || [];
    const now = new Date().toISOString();

    const updatedTires = tiresList.map((t) => {
      if (!chosenIds.has(t.id)) return t;
      return { ...t, location: location.trim(), updatedAt: now };
    });

    const newHistory: StageHistory[] = chosen.map((t, i) => ({
      id: `h-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: t.id,
      stage: "warehouse",
      location: location.trim(),
      movedAt: now,
      movedBy: placedBy.trim(),
      notes: notes.trim() || `Placed ${qty} tire${qty === 1 ? "" : "s"} at ${location.trim()}`,
    }));

    const newLogs: PlacementLog[] = chosen.map((t, i) => ({
      id: `p-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
      tireId: t.id,
      location: location.trim(),
      placedAt: now,
      placedBy: placedBy.trim(),
      notes: notes.trim() || `Placed ${qty} tire${qty === 1 ? "" : "s"} at ${location.trim()}`,
    }));

    const updatedDb = {
      ...db,
      tires: updatedTires,
      tireHistory: [...historyList, ...newHistory],
      placementLogs: [...logsList, ...newLogs],
    };

    writeDb(updatedDb);
    setTires(updatedTires);
    setPlacementLogs(updatedDb.placementLogs as PlacementLog[]);

    setSize("");
    setQuantity("1");
    setNotes("");
    setSuccess(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <MapPin className="size-6 text-primary" />
            Place tires at location
          </h1>
          <p className="text-muted-foreground">
            Record the tire size, quantity, and exact storage location where the tires are placed.
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
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <PackageCheck className="size-5 text-primary" />
            Placement details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Ruler className="size-4 text-muted-foreground" />
                Tire size
              </label>
              <select
                value={size}
                onChange={(e) => setSize(e.target.value)}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Choose a tire size</option>
                {sizes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Hash className="size-4 text-muted-foreground" />
                Quantity
              </label>
              <input
                type="number"
                min={1}
                max={availableForSize || undefined}
                value={quantity}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="Qty"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {size && (
                <p className="text-xs text-muted-foreground">
                  {availableForSize} tire{availableForSize === 1 ? "" : "s"} of this size are available.
                </p>
              )}
            </div>

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
                Placed by
              </label>
              <input
                type="text"
                value={placedBy}
                onChange={(e) => setPlacedBy(e.target.value)}
                placeholder="Operator / handler name"
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <ClipboardList className="size-4 text-muted-foreground" />
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional placement notes"
                rows={3}
                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
          )}

          {success && (
            <div className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success flex items-center gap-2">
              <Check className="size-4" />
              Placement recorded successfully.
            </div>
          )}

          <button
            onClick={handlePlace}
            disabled={candidates.length === 0}
            className={cn(
              "w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors",
              candidates.length === 0
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            Place tires
          </button>

          <p className="text-xs text-muted-foreground">
            This updates the location of the selected warehouse tires and records a placement log for each tire.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm h-fit space-y-4">
          <h2 className="text-lg font-medium text-foreground">Available warehouse stock</h2>
          {sizes.length === 0 ? (
            <div className="rounded-xl bg-muted p-4 text-center text-sm text-muted-foreground">
              No warehouse tires are available to place.
            </div>
          ) : (
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {sizes.map((s) => (
                <li
                  key={s}
                  onClick={() => setSize(s)}
                  className={cn(
                    "flex items-center justify-between rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors",
                    size === s
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border bg-card hover:bg-muted",
                  )}
                >
                  <span className="font-medium text-foreground">{s}</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                    {availability.get(s)} available
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {placementLogs.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-medium text-foreground flex items-center gap-2">
            <ClipboardList className="size-5 text-primary" />
            Recent placement logs
          </h2>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Serial</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Size</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Storage location</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Placed by</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Placed at</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {placementLogs
                  .slice()
                  .sort((a, b) => b.placedAt.localeCompare(a.placedAt))
                  .slice(0, 20)
                  .map((log) => {
                    const tire = tires.find((t) => t.id === log.tireId);
                    return (
                      <tr key={log.id}>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {tire ? tire.serialNumber : log.tireId}
                        </td>
                        <td className="px-4 py-3 text-foreground">{tire ? tire.size : "—"}</td>
                        <td className="px-4 py-3 text-foreground">{log.location}</td>
                        <td className="px-4 py-3 text-foreground">{log.placedBy}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(log.placedAt).toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{log.notes || "—"}</td>
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

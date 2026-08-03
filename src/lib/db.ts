// Bumped from v3 to v4 to drop the mock/demo data that used to seed a fresh
// browser (fake tires, dispatch plan, driver) — real installs load from an
// empty state and populate it themselves.
const DB_KEY = "app-db-v4";

// Seed shape for a first run — extend this object's top-level keys as features are added,
// never replace it wholesale (existing collections must keep working across edits).
const SEED: Record<string, unknown> = {
  tires: [],
  tireHistory: [],
  placementLogs: [],
  dispatchLogs: [],
  dispatchPlans: [],
  shipmentTrackingUpdates: [],
  bayBookings: [],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function readDb(): Record<string, any> {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    localStorage.setItem(DB_KEY, JSON.stringify(SEED));
    return structuredClone(SEED);
  }
  return JSON.parse(raw);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function writeDb(data: Record<string, any>): void {
  localStorage.setItem(DB_KEY, JSON.stringify(data));
}

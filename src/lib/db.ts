import type { Tire, TireDispatch, DispatchPlan } from "@/types/tire";
import { buildTireFromCatalogRow, parseCatalogText } from "@/lib/tire-catalog";
import { WAREHOUSES, locationForBin } from "@/data/warehouse-bins";

const DB_KEY = "app-db-v3";

// Real tire catalog rows (Material, Tire Description-Brand, Ply Rating Bottom, Brand),
// loaded as production-stage stock ready to be received/placed.
const CATALOG_SEED_TEXT = `
135046-36\t54 × 31.00-26 NHS MIGHTY MOW 10 PR TL - GALAXY\t10 PR\tGalaxy
100259-36\t10-16.5 BEEFY BABY II 8 PR TL R-4 GALAXY\t8 PR\tGalaxy
100259-36D\t10-16.5 BEEFY BABY II 8 PR TL R-4 GALAXY-DOMESTIC-D\t8 PR\tGalaxy
100260-36\t10-16.5 BEEFY BABY II 10 PR TL R-4 GALAXY\t10 PR\tGalaxy
100264-36\t12-16.5 NHS SUPER SIDEWALL-BEEFY BABY II 10 PR TL R-4 GALAXY\t10 PR\tGalaxy
100276-36\t14-17.5NHS SUPER SIDEWALL-THE BEEFY BABY II 10 PR TL R-4 GALAXY\t10 PR\tGalaxy
100278-36\t14-17.5NHS SUPER SIDEWALL-THE BEEFY BABY II 14 PR TL R-4 GALAXY\t14 PR\tGalaxy
100287-36\t12.5/80-18 IMP SUPER SIDEWALL - THE BEEFY BABY 10 PR TL I-3 GALAXY\t10 PR\tGalaxy
100289-36\t12.5/80-18 IMP SUPER SIDEWALL - THE BEEFY BABY 14 PR TL I-3 GALAXY\t14 PR\tGalaxy
100291-36\t12.5/80-18 IMP SUPER SIDEWALL - THE BEEFY BABY 14 PR TL I-3 GALAXY\t14 PR\tGalaxy
100297-36\t15-19.5NHS SUPER SIDEWALL - THE BEEFY BABY 14 PR TL NA GALAXY\t14 PR\tGalaxy
101002-36\t540/65R30 Earth-Pro Radial 651 150D / (153/A8) TL GALAXY\t\tGalaxy
101003-36\t650/65R42 Earth-Pro Radial 651 170D/173A8 TL GALAXY\t\tGalaxy
101005-36\t650/65R38 Earth-Pro Radial 651 171D/174A8 TL GALAXY\t\tGalaxy
101006-36\t480/65R28 Earth-Pro Radial 651 142 D/145 A8 GALAXY\t\tGalaxy
`.trim();

// Builds a small realistic dataset spread across every stage — production
// (Inward candidates), a warehouse bin (Outward candidates), and an active
// dispatch (Dispatch tires / Delivery tracking) — so a fresh install already
// has something to look at instead of every screen showing empty states.
function buildSeedData(): { tires: Tire[]; dispatchLogs: TireDispatch[]; dispatchPlans: DispatchPlan[] } {
  const now = new Date().toISOString();
  const rows = parseCatalogText(CATALOG_SEED_TEXT);

  const plan: DispatchPlan = {
    id: "plan-seed-1",
    driverName: "Ravi Kumar",
    destination: "Pune Dealer",
    truckNumber: "KA 01 AB 1234",
    createdAt: now,
    createdBy: "Warehouse Team",
    notes: "",
    status: "open",
  };

  const tires: Tire[] = [];
  const dispatchLogs: TireDispatch[] = [];

  rows.forEach((row, i) => {
    // Still in production — ready to bring Inward.
    tires.push(buildTireFromCatalogRow(row, `t-seed-${i}-prod`, now));

    // Already sitting in a warehouse bin — ready to pick via Outward.
    const warehouse = WAREHOUSES[i % WAREHOUSES.length];
    const bin = `01-${String((i % 9) + 1).padStart(2, "0")}`;
    tires.push({
      ...buildTireFromCatalogRow(row, `t-seed-${i}-wh`, now),
      currentStage: "warehouse",
      location: locationForBin(warehouse, bin),
    });

    // Already on an open dispatch plan — visible in Dispatch tires / Delivery tracking.
    const dispatchTireId = `t-seed-${i}-disp`;
    tires.push({
      ...buildTireFromCatalogRow(row, dispatchTireId, now),
      currentStage: "dispatch",
      location: plan.destination,
    });
    dispatchLogs.push({
      id: `d-seed-${i}`,
      tireId: dispatchTireId,
      planId: plan.id,
      driverName: plan.driverName,
      destination: plan.destination,
      dispatchedAt: now,
      dispatchedBy: plan.createdBy,
      status: "holding-bay",
      notes: "",
    });
  });

  return { tires, dispatchLogs, dispatchPlans: [plan] };
}

const SEEDED = buildSeedData();

// Seed shape for a first run — extend this object's top-level keys as features are added,
// never replace it wholesale (existing collections must keep working across edits).
const SEED: Record<string, unknown> = {
  tires: SEEDED.tires,
  tireHistory: [],
  placementLogs: [],
  dispatchLogs: SEEDED.dispatchLogs,
  dispatchPlans: SEEDED.dispatchPlans,
  shipmentTrackingUpdates: [],
  truckLoadConfirmations: [],
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

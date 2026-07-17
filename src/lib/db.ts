import type { Tire, StageHistory, PlacementLog, TireDispatch, ShipmentTrackingUpdate, TruckLoadConfirmation } from "@/types/tire";
import { buildTireFromCatalogRow, parseCatalogText } from "@/lib/tire-catalog";

const DB_KEY = "app-db-v2";

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

// Seed shape for a first run — extend this object's top-level keys as features are added,
// never replace it wholesale (existing collections must keep working across edits).
const SEED: Record<string, unknown> = {
  tires: seedTires(),
  tireHistory: seedHistory(),
  placementLogs: seedPlacementLogs(),
  dispatchLogs: seedDispatchLogs(),
  shipmentTrackingUpdates: seedShipmentTrackingUpdates(),
  truckLoadConfirmations: seedTruckLoadConfirmations(),
};

function seedTires(): Tire[] {
  const now = new Date().toISOString();
  return parseCatalogText(CATALOG_SEED_TEXT).map((row, i) => buildTireFromCatalogRow(row, `t-seed-${i + 1}`, now));
}

function seedHistory(): StageHistory[] {
  return [];
}

function seedPlacementLogs(): PlacementLog[] {
  return [];
}

function seedDispatchLogs(): TireDispatch[] {
  return [];
}

function seedShipmentTrackingUpdates(): ShipmentTrackingUpdate[] {
  return [];
}

function seedTruckLoadConfirmations(): TruckLoadConfirmation[] {
  return [];
}

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

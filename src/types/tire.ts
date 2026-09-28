export type TireStage =
  | "production"
  | "quality-check"
  | "warehouse"
  | "dispatch"
  | "dealer"
  | "mounted"
  | "retread"
  | "scrapped";

export interface Tire {
  id: string;
  serialNumber: string;
  model: string;
  size: string;
  productionDate: string;
  currentStage: TireStage;
  location: string;
  status: "active" | "hold" | "sold" | "scrapped";
  notes: string;
  warrantyMonths: number;
  costPrice: number;
  plyRatingBottom?: string;
  brand?: string;
  skuQrCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StageHistory {
  id: string;
  tireId: string;
  stage: TireStage;
  location: string;
  movedAt: string;
  movedBy: string;
  notes: string;
}

export interface PlacementLog {
  id: string;
  tireId: string;
  location: string;
  placedAt: string;
  placedBy: string;
  notes: string;
}

// One pick record: a worker reporting "I took N of this tire from this
// location". Confirming the pick also takes that many tires out of stock
// (see takeOutOfStock in stock-out.ts); this record is what History and the
// PICK SHEET export read back.
export interface PickingRecord {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  palletNo: string;
  shift: string;
  pickerName: string;
  pickedAt: string;
  pickedBy: string;
  notes: string;
}

// One Outward record: "N of this tire left stock from this location". Same
// shape as PickingRecord; confirming Outward likewise takes that many tires
// out of stock (see takeOutOfStock in stock-out.ts).
export interface OutwardRecord {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  palletNo: string;
  shift: string;
  pickerName: string;
  outwardAt: string;
  outwardBy: string;
  notes: string;
}

// One Inward receipt record: "this many of this tire arrived at this bin",
// grouped by Material + bin within a single confirm — mirrors PickingRecord's
// role for the other direction. Several of these, across several confirms
// sharing the same Plan No, are what the cumulative Inward Excel is built from.
export interface InwardReceipt {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  palletNo: string;
  shift: string;
  pickerName: string;
  receivedAt: string;
  receivedBy: string;
  notes: string;
}


export const STAGE_LABELS: Record<TireStage, string> = {
  production: "Production",
  "quality-check": "Quality Check",
  warehouse: "Warehouse",
  dispatch: "Dispatch",
  dealer: "Dealer",
  mounted: "Mounted",
  retread: "Retread",
  scrapped: "Scrapped",
};

export const STAGE_ORDER: TireStage[] = [
  "production",
  "quality-check",
  "warehouse",
  "dispatch",
  "dealer",
  "mounted",
  "retread",
  "scrapped",
];

export const NEXT_STAGE: Record<TireStage, TireStage | null> = {
  production: "quality-check",
  "quality-check": "warehouse",
  warehouse: "dispatch",
  dispatch: "dealer",
  dealer: "mounted",
  mounted: "retread",
  retread: "scrapped",
  scrapped: null,
};

export type BayStatus = "closed" | "running" | "hold" | "qc-pending";

// One card per bay (1-13, fixed) on the bay booking board.
export interface BayBooking {
  bay: number;
  pendingTire: string;
  planNo: string;
  status: BayStatus;
  qty: number;
  updatedAt: string;
}

export const BAY_COUNT = 13;

// A tyre + qty still owed against a dispatch plan, logged from the Loading
// Bay board's "Pending Tyre" button. Several entries can exist per plan.
export interface PlanPendingTire {
  id: number;
  planNo: string;
  tire: string;
  qty: number;
  createdAt: string;
}

export const BAY_STATUS_LABELS: Record<BayStatus, string> = {
  closed: "Closed",
  running: "Running",
  hold: "Hold",
  "qc-pending": "QC Pending",
};

// One occupancy session of a plan no. on a bay — from the moment it's set
// until the bay is marked Closed (or the plan is cleared/replaced).
// closedAt is null while the session is still open (bay not yet Closed).
export interface BayHistorySession {
  id: number;
  bay: number;
  planNo: string;
  status: BayStatus;
  qty: number;
  pendingTire: string;
  openedAt: string;
  closedAt: string | null;
}

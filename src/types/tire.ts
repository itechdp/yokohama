export type TireStage =
  | "production"
  | "quality-check"
  | "warehouse"
  | "dispatch"
  | "dealer"
  | "mounted"
  | "retread"
  | "scrapped";

export type DispatchStatus =
  | "holding-bay"
  | "loading"
  | "picked-up"
  | "loaded"
  | "in-transit"
  | "at-hub"
  | "out-for-delivery"
  | "delivered"
  | "delayed"
  | "returned";

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

// One Outward pick record: a worker reporting "I took N of this tire from
// this location" — standalone, not tied to any tires-table row or stage
// transition. Unlike the old Outward flow (which only worked because Inward
// had already recorded a bin), this is the entire source of truth for where
// a tire was picked from.
export interface OutwardPick {
  id: string;
  material: string;
  description: string;
  warehouse: string;
  location: string;
  quantity: number;
  planNo: string;
  pickedAt: string;
  pickedBy: string;
  notes: string;
}

// One Inward receipt record: "this many of this tire arrived at this bin",
// grouped by Material + bin within a single confirm — mirrors OutwardPick's
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
  receivedAt: string;
  receivedBy: string;
  notes: string;
}

export interface TireDispatch {
  id: string;
  tireId: string;
  planId?: string;
  driverName: string;
  destination: string;
  dispatchedAt: string;
  dispatchedBy: string;
  status: DispatchStatus;
  notes: string;
}

// One truck/destination/driver. Tyres get added to a plan, each tracked
// individually (Holding in Bay -> Loading onto Truck -> Loaded onto Truck)
// before the truck itself is marked dispatched.
export interface DispatchPlan {
  id: string;
  driverName: string;
  destination: string;
  truckNumber: string;
  createdAt: string;
  createdBy: string;
  notes: string;
  status: "open" | "dispatched";
  dispatchedAt?: string;
}

export interface ShipmentTrackingUpdate {
  id: string;
  dispatchId: string;
  tireId: string;
  status: DispatchStatus;
  location: string;
  updatedAt: string;
  updatedBy: string;
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

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  "holding-bay": "Holding in Bay",
  loading: "Loading onto Truck",
  loaded: "Loaded onto Truck",
  "picked-up": "Picked up",
  "in-transit": "In transit",
  "at-hub": "At hub",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  delayed: "Delayed",
  returned: "Returned",
};

export const DISPATCH_STATUS_ORDER: DispatchStatus[] = [
  "holding-bay",
  "loading",
  "loaded",
  "picked-up",
  "in-transit",
  "at-hub",
  "out-for-delivery",
  "delivered",
];

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

export const DELIVERY_PROGRESS: Record<DispatchStatus, number> = {
  "holding-bay": 5,
  loading: 12,
  loaded: 20,
  "picked-up": 30,
  "in-transit": 50,
  "at-hub": 65,
  "out-for-delivery": 85,
  delivered: 100,
  delayed: 0,
  returned: 0,
};

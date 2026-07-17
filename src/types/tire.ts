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

export interface TireDispatch {
  id: string;
  tireId: string;
  driverName: string;
  destination: string;
  dispatchedAt: string;
  dispatchedBy: string;
  status: DispatchStatus;
  notes: string;
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

export interface TruckLoadConfirmation {
  id: string;
  size: string;
  tireIds: string[];
  dispatchIds: string[];
  confirmedAt: string;
  confirmedBy: string;
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
  "picked-up": "Picked up",
  loaded: "Loaded on truck",
  "in-transit": "In transit",
  "at-hub": "At hub",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  delayed: "Delayed",
  returned: "Returned",
};

export const DISPATCH_STATUS_ORDER: DispatchStatus[] = [
  "picked-up",
  "loaded",
  "in-transit",
  "at-hub",
  "out-for-delivery",
  "delivered",
];

export const DELIVERY_PROGRESS: Record<DispatchStatus, number> = {
  "picked-up": 10,
  loaded: 25,
  "in-transit": 45,
  "at-hub": 60,
  "out-for-delivery": 80,
  delivered: 100,
  delayed: 0,
  returned: 0,
};

import type { ModuleKey } from "@/lib/user-policy";

// The permission units. An Operator is given a set of these; Admins and the Super Admin
// have all of them. The database enforces the same list (rbac_05_rls_cutover.sql).
export interface ModuleInfo {
  key: ModuleKey;
  label: string;
  // What it covers, shown to the Admin when choosing an Operator's modules.
  covers: string;
}

export const MODULES: ModuleInfo[] = [
  { key: "inward", label: "Inward", covers: "Receive tyres into the warehouse" },
  { key: "putaway", label: "Putaway", covers: "Place pending pallets into bins" },
  { key: "picking", label: "Picking", covers: "Pick tyres out for a plan" },
  { key: "outward", label: "Outward", covers: "Dispatch tyres out of stock" },
  { key: "stock", label: "Stock", covers: "View, adjust and export stock" },
  { key: "prepare_plan", label: "Prepare Plan", covers: "Create and upload plans" },
  { key: "show_tire", label: "Show Tire / SKU", covers: "Tyre catalogue, add tyre, bulk upload" },
  { key: "history", label: "History", covers: "Inward, picking and block-tyre history" },
  { key: "loading_bay", label: "Loading Bay", covers: "Bays, pending tyres and blocked tyres" },
  { key: "bay_history", label: "Bay History", covers: "Closed-bay reports" },
  { key: "warehouses", label: "Warehouses", covers: "Add and edit warehouses" },
];

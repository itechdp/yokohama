import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardList,
  ClipboardPen,
  History,
  LayoutGrid,
  List,
  PackageCheck,
  PackageSearch,
  Users,
  Warehouse,
  type LucideIcon,
} from "lucide-react";
import type { ModuleKey } from "@/lib/user-policy";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  // The module an Operator needs for this tile. Admins and the Super Admin see every tile.
  module?: ModuleKey;
  // Only Admin and Super Admin see this tile.
  staffOnly?: boolean;
}

// The main entry points, shown as tap-friendly circles on the home screen.
// Bulk upload lives inside Add Tire (linked from /tires/skus's "Add tire"
// button) rather than getting its own top-level circle.
export const FEATURE_ITEMS: NavItem[] = [
  { to: "/tires/inward", label: "Inward", icon: ArrowDownToLine, module: "inward" },
  { to: "/tires/putaway", label: "Putaway", icon: PackageCheck, module: "putaway" },
  { to: "/tires/picking", label: "Picking", icon: ClipboardList, module: "picking" },
  { to: "/tires/outward", label: "Outward", icon: ArrowUpFromLine, module: "outward" },
  { to: "/tires/stock", label: "Stock", icon: PackageSearch, module: "stock" },
  { to: "/plans", label: "Prepare Plan", icon: ClipboardPen, module: "prepare_plan" },
  { to: "/tires/skus", label: "Show tire", icon: List, module: "show_tire" },
  { to: "/tires/history", label: "History", icon: History, module: "history" },
  { to: "/bays", label: "Loading Bay", icon: LayoutGrid, module: "loading_bay" },
  { to: "/bays/history", label: "Bay History", icon: History, module: "bay_history" },
  { to: "/warehouses", label: "Warehouses", icon: Warehouse, module: "warehouses" },
  { to: "/admin/users", label: "Users", icon: Users, staffOnly: true },
];

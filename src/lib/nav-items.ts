import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  LayoutGrid,
  List,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// The main entry points, shown as tap-friendly circles on the home screen.
// Bulk upload lives inside Add Tire (linked from /tires/skus's "Add tire"
// button) rather than getting its own top-level circle.
export const FEATURE_ITEMS: NavItem[] = [
  { to: "/tires/inward", label: "Inward", icon: ArrowDownToLine },
  { to: "/tires/outward", label: "Outward", icon: ArrowUpFromLine },
  { to: "/tires/skus", label: "Show tire", icon: List },
  { to: "/tires/dispatch", label: "Dispatch", icon: Truck },
  { to: "/bays", label: "Loading Bay", icon: LayoutGrid },
  { to: "/bays/history", label: "Bay History", icon: History },
  { to: "/warehouses", label: "Warehouses", icon: Warehouse },
];

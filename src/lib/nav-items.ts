import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  CirclePlus,
  Import,
  List,
  MapPin,
  PackageCheck,
  Route,
  Search,
  Truck,
  UploadCloud,
  Warehouse,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// The main entry points, shown as tap-friendly circles on the home screen.
export const FEATURE_ITEMS: NavItem[] = [
  { to: "/tires/inward", label: "Inward", icon: ArrowDownToLine },
  { to: "/tires/outward", label: "Outward", icon: ArrowUpFromLine },
  { to: "/tires/new", label: "Add tire", icon: CirclePlus },
  { to: "/tires/bulk-upload", label: "Bulk upload", icon: UploadCloud },
  { to: "/tires/dispatch", label: "Dispatch", icon: Truck },
];

// Everything else — tucked away in a collapsible list instead of a sidebar.
export const OTHER_PAGE_ITEMS: NavItem[] = [
  { to: "/tire-dashboard", label: "Tire dashboard", icon: BarChart3 },
  { to: "/tires/process", label: "Process tracking", icon: Workflow },
  { to: "/tires", label: "Tire inventory", icon: List },
  { to: "/tires/locations", label: "Tire locations", icon: Warehouse },
  { to: "/tires/search", label: "Dispatch stock search", icon: Search },
  { to: "/tires/shipment-tracking", label: "Delivery tracking", icon: Route },
  { to: "/tires/receive", label: "Receive from production", icon: Import },
  { to: "/tires/place", label: "Place tires", icon: MapPin },
  { to: "/tires/confirm-load", label: "Confirm truck load", icon: PackageCheck },
];

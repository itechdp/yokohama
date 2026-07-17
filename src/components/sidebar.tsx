import {
  ArrowDownToLine,
  BarChart3,
  CirclePlus,
  Home,
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
} from "lucide-react";
import { NavLink } from "react-router";
import { cn } from "@/lib/utils";

// Add one entry here for every page/feature you build — nothing should be reachable
// only by typing a URL; it must show up as a tab here too.
const NAV_ITEMS = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tire-dashboard", label: "Tire dashboard", icon: BarChart3 },
  { to: "/tires/process", label: "Process tracking", icon: Workflow },
  { to: "/tires", label: "Tire inventory", icon: List },
  { to: "/tires/locations", label: "Tire locations", icon: Warehouse },
  { to: "/tires/search", label: "Dispatch stock search", icon: Search },
  { to: "/tires/shipment-tracking", label: "Delivery tracking", icon: Route },
  { to: "/tires/receive", label: "Receive from production", icon: Import },
  { to: "/tires/inward", label: "Inward - Warehouse", icon: ArrowDownToLine },
  { to: "/tires/place", label: "Place tires", icon: MapPin },
  { to: "/tires/dispatch", label: "Dispatch tires", icon: Truck },
  { to: "/tires/confirm-load", label: "Confirm truck load", icon: PackageCheck },
  { to: "/tires/new", label: "Add tire", icon: CirclePlus },
  { to: "/tires/bulk-upload", label: "Bulk upload tires", icon: UploadCloud },
];

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="h-14 flex items-center px-4 font-semibold text-foreground">App</div>
      <nav className="flex-1 px-2 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

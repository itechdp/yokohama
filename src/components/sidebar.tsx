import {
  ArrowDownToLine,
  ArrowUpFromLine,
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
  X,
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
  { to: "/tires/outward", label: "Outward - Warehouse", icon: ArrowUpFromLine },
  { to: "/tires/place", label: "Place tires", icon: MapPin },
  { to: "/tires/dispatch", label: "Dispatch tires", icon: Truck },
  { to: "/tires/confirm-load", label: "Confirm truck load", icon: PackageCheck },
  { to: "/tires/new", label: "Add tire", icon: CirclePlus },
  { to: "/tires/bulk-upload", label: "Bulk upload tires", icon: UploadCloud },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {open && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40" aria-hidden="true" />}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-border bg-card transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          <span className="font-semibold text-foreground">App</span>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
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
    </>
  );
}

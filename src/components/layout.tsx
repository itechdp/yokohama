import { Link, Outlet, useLocation } from "react-router";
import { Home } from "lucide-react";

export default function Layout() {
  const location = useLocation();
  const isHome = location.pathname === "/";

  return (
    <div className="flex h-full flex-col">
      {!isHome && (
        <header className="flex h-12 shrink-0 items-center border-b border-border bg-card px-4">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <Home className="size-4" />
            Home
          </Link>
        </header>
      )}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

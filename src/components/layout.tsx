import { useState } from "react";
import { Outlet } from "react-router";
import { Menu } from "lucide-react";
import Sidebar from "@/components/sidebar";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-full">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <span className="font-semibold text-foreground">App</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

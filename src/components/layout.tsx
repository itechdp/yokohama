import { Outlet } from "react-router";
import Sidebar from "@/components/sidebar";

export default function Layout() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}

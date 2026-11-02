import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/contexts/auth-context";
import { decideAccess } from "@/lib/route-access";
import type { ModuleKey } from "@/lib/user-policy";

// Guards a group of routes:
//   (no props)  signed in
//   module      signed in AND allowed that module (Admins and the Super Admin always are)
//   staffOnly   Admin or Super Admin only
//   superOnly   Super Admin only
// This is the routing half of the permissions. The database enforces the same rules on
// every request, so typing a restricted URL or calling the API directly gets nowhere.
export default function ProtectedRoute({
  module,
  staffOnly,
  superOnly,
}: {
  module?: ModuleKey;
  staffOnly?: boolean;
  superOnly?: boolean;
}) {
  const { user, loading } = useAuth();
  const location = useLocation();

  switch (decideAccess({ user, loading, module, staffOnly, superOnly })) {
    case "loading":
      return <div className="flex min-h-full items-center justify-center text-sm text-muted-foreground">Loading...</div>;
    case "login":
      return <Navigate to="/login" state={{ from: location }} replace />;
    case "no-access":
      return <Navigate to="/" state={{ noAccess: true }} replace />;
    default:
      return <Outlet />;
  }
}

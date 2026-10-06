import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "@/contexts/auth-context";

export default function ProtectedRoute({ adminOnly }: { adminOnly?: boolean }) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

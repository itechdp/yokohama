import { Route, Routes } from "react-router";
import Layout from "@/components/layout";
import ProtectedRoute from "@/components/protected-route";
import AdminUsers from "@/pages/admin-users";
import ChangePassword from "@/pages/change-password";
import BayBooking from "@/pages/bay-booking";
import BayHistory from "@/pages/bay-history";
import Home from "@/pages/home";
import Login from "@/pages/login";
import BlockTyreDetail from "@/pages/block-tyre-detail";
import BlockTyrePlans from "@/pages/block-tyre-plans";
import PendingPutaway from "@/pages/pending-putaway";
import PendingTyreDetail from "@/pages/pending-tyre-detail";
import PendingTyrePlans from "@/pages/pending-tyre-plans";
import PreparePlan from "@/pages/prepare-plan";
import TireBulkUpload from "@/pages/tire-bulk-upload";
import TireHistory from "@/pages/tire-history";
import TireInward from "@/pages/tire-inward";
import TireNew from "@/pages/tire-new";
import TireOutward from "@/pages/tire-outward";
import TirePicking from "@/pages/tire-picking";
import TireSkuCatalog from "@/pages/tire-sku-catalog";
import TireStock from "@/pages/tire-stock";
import Warehouses from "@/pages/warehouses";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />

          <Route element={<ProtectedRoute superOnly />}>
            <Route path="/account/password" element={<ChangePassword />} />
          </Route>

          {/* Each group below needs one module. Admins and the Super Admin have them all. */}
          <Route element={<ProtectedRoute module="show_tire" />}>
            <Route path="/tires/skus" element={<TireSkuCatalog />} />
            <Route path="/tires/new" element={<TireNew />} />
            <Route path="/tires/bulk-upload" element={<TireBulkUpload />} />
          </Route>
          <Route element={<ProtectedRoute module="inward" />}>
            <Route path="/tires/inward" element={<TireInward />} />
          </Route>
          <Route element={<ProtectedRoute module="putaway" />}>
            <Route path="/tires/putaway" element={<PendingPutaway />} />
          </Route>
          <Route element={<ProtectedRoute module="prepare_plan" />}>
            <Route path="/plans" element={<PreparePlan />} />
          </Route>
          <Route element={<ProtectedRoute module="picking" />}>
            <Route path="/tires/picking" element={<TirePicking />} />
          </Route>
          <Route element={<ProtectedRoute module="outward" />}>
            <Route path="/tires/outward" element={<TireOutward />} />
          </Route>
          <Route element={<ProtectedRoute module="stock" />}>
            <Route path="/tires/stock" element={<TireStock />} />
          </Route>
          <Route element={<ProtectedRoute module="history" />}>
            <Route path="/tires/history" element={<TireHistory />} />
          </Route>
          <Route element={<ProtectedRoute module="loading_bay" />}>
            <Route path="/bays" element={<BayBooking />} />
            <Route path="/bays/pending" element={<PendingTyrePlans />} />
            <Route path="/bays/pending/:planNo" element={<PendingTyreDetail />} />
            <Route path="/bays/block" element={<BlockTyrePlans />} />
            <Route path="/bays/block/:planNo" element={<BlockTyreDetail />} />
          </Route>
          <Route element={<ProtectedRoute module="bay_history" />}>
            <Route path="/bays/history" element={<BayHistory />} />
          </Route>
          <Route element={<ProtectedRoute module="warehouses" />}>
            <Route path="/warehouses" element={<Warehouses />} />
          </Route>

          <Route element={<ProtectedRoute staffOnly />}>
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  );
}

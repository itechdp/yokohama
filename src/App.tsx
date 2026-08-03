import { Route, Routes } from "react-router";
import Layout from "@/components/layout";
import BayBooking from "@/pages/bay-booking";
import Home from "@/pages/home";
import PendingTyreDetail from "@/pages/pending-tyre-detail";
import PendingTyrePlans from "@/pages/pending-tyre-plans";
import TireBulkUpload from "@/pages/tire-bulk-upload";
import TireDispatch from "@/pages/tire-dispatch";
import TireInward from "@/pages/tire-inward";
import TireNew from "@/pages/tire-new";
import TireOutward from "@/pages/tire-outward";
import TireSkuCatalog from "@/pages/tire-sku-catalog";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/tires/skus" element={<TireSkuCatalog />} />
        <Route path="/tires/new" element={<TireNew />} />
        <Route path="/tires/bulk-upload" element={<TireBulkUpload />} />
        <Route path="/tires/inward" element={<TireInward />} />
        <Route path="/tires/outward" element={<TireOutward />} />
        <Route path="/tires/dispatch" element={<TireDispatch />} />
        <Route path="/bays" element={<BayBooking />} />
        <Route path="/bays/pending" element={<PendingTyrePlans />} />
        <Route path="/bays/pending/:planNo" element={<PendingTyreDetail />} />
      </Route>
    </Routes>
  );
}

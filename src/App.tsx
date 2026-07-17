import { Route, Routes } from "react-router";
import Layout from "@/components/layout";
import Home from "@/pages/home";
import TireBulkUpload from "@/pages/tire-bulk-upload";
import TireConfirmLoad from "@/pages/tire-confirm-load";
import TireDashboard from "@/pages/tire-dashboard";
import TireDetail from "@/pages/tire-detail";
import TireDispatch from "@/pages/tire-dispatch";
import TireInward from "@/pages/tire-inward";
import TireLocations from "@/pages/tire-locations";
import TireNew from "@/pages/tire-new";
import TirePlace from "@/pages/tire-place";
import TireProcess from "@/pages/tire-process";
import TireReceive from "@/pages/tire-receive";
import TireSearch from "@/pages/tire-search";
import TireShipmentTracking from "@/pages/tire-shipment-tracking";
import Tires from "@/pages/tires";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/tires" element={<Tires />} />
        <Route path="/tires/new" element={<TireNew />} />
        <Route path="/tires/bulk-upload" element={<TireBulkUpload />} />
        <Route path="/tires/receive" element={<TireReceive />} />
        <Route path="/tires/inward" element={<TireInward />} />
        <Route path="/tires/place" element={<TirePlace />} />
        <Route path="/tires/dispatch" element={<TireDispatch />} />
        <Route path="/tires/search" element={<TireSearch />} />
        <Route path="/tires/locations" element={<TireLocations />} />
        <Route path="/tires/:id" element={<TireDetail />} />
        <Route path="/tires/shipment-tracking" element={<TireShipmentTracking />} />
        <Route path="/tires/confirm-load" element={<TireConfirmLoad />} />
        <Route path="/tires/process" element={<TireProcess />} />
        <Route path="/tire-dashboard" element={<TireDashboard />} />
      </Route>
    </Routes>
  );
}

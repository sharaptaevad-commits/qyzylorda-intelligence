// Report Intake module — nested routes.
// Rendered as <Route path="ri/*" element={<RiRoutes />} /> in App.tsx.
// This component provides its own inner <Routes> so that child <Route>
// elements are valid. When the feature flag is off it renders null.
import { Routes, Route, Navigate } from "react-router-dom";
import { useReportIntakeEnabled } from "./useFlag";
import RiShell from "./Shell";
import RiDashboard from "./Dashboard";
import RiEntities from "./Entities";
import RiUpload from "./Upload";
import RiMerged from "./MergedTable";
import RiHistory from "./SendHistory";
import RiCheckResult from "./CheckResult";

export default function RiRoutes() {
  const { enabled, loading } = useReportIntakeEnabled();
  // While loading or flag off — render nothing (the ri/* route simply shows a blank).
  if (loading || !enabled) return null;
  return (
    <Routes>
      <Route index element={<RiDashboard />} />
      <Route path="entities" element={<RiEntities />} />
      <Route path="upload" element={<RiUpload />} />
      <Route path="merged" element={<RiMerged />} />
      <Route path="history" element={<RiHistory />} />
      <Route path="check/:reportId" element={<RiCheckResult />} />
      <Route path="*" element={<Navigate to="ri" replace />} />
    </Routes>
  );
}

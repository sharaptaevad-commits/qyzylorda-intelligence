import React from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Shell from "./Shell";
import Dashboard from "./pages/Dashboard";
import Industrial from "./pages/Industrial";
import Manufacturing from "./pages/Manufacturing";
import District from "./pages/District";
import Forecast from "./pages/Forecast";
import Alerts from "./pages/Alerts";
import Documents from "./pages/Documents";
import Comparative from "./pages/Comparative";
import AiAnalyst from "./pages/AiAnalyst";
import Reports from "./pages/Reports";
import DataManagement from "./pages/DataManagement";
import Sources from "./pages/Sources";
import Settings from "./pages/Settings";

import { RobotProvider } from "./components/ai/useRobotState";
import FloatingRobot from "./components/ai/FloatingRobot";
import RiRoutes from "./modules/report-intake/RiRoutes";

export default function App() {
  return (
    <HashRouter>
      <RobotProvider>
        <FloatingRobot />
        <Routes>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="industrial" element={<Industrial />} />
          <Route path="manufacturing" element={<Manufacturing />} />
          <Route path="district" element={<District />} />
          <Route path="forecast" element={<Forecast />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="documents" element={<Documents />} />
          <Route path="compare" element={<Comparative />} />
          <Route path="ai" element={<AiAnalyst />} />
          <Route path="reports" element={<Reports />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="sources" element={<Sources />} />
          <Route path="settings" element={<Settings />} />
          <Route path="ri/*" element={<RiRoutes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
        </Routes>
      </RobotProvider>
    </HashRouter>
  );
}

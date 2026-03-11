import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import LineConfig from "@/pages/LineConfig";
import TVDisplay from "@/pages/TVDisplay";
import SiteManagement from "@/pages/SiteManagement";
import ScreenManagement from "@/pages/ScreenManagement";
import Statistics from "@/pages/Statistics";
import { TaktProvider } from "@/context/TaktContext";

function App() {
  return (
    <TaktProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sites" element={<SiteManagement />} />
          <Route path="/config/new" element={<LineConfig />} />
          <Route path="/config/:lineId" element={<LineConfig />} />
          <Route path="/screens/:lineId" element={<ScreenManagement />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/statistics/:lineId" element={<Statistics />} />
          <Route path="/tv/:lineId" element={<TVDisplay />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </TaktProvider>
  );
}

export default App;

import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Dashboard from "@/pages/Dashboard";
import LineConfig from "@/pages/LineConfig";
import TVDisplay from "@/pages/TVDisplay";
import { TaktProvider } from "@/context/TaktContext";

function App() {
  return (
    <TaktProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/config/:lineId" element={<LineConfig />} />
          <Route path="/config/new" element={<LineConfig />} />
          <Route path="/tv/:lineId" element={<TVDisplay />} />
        </Routes>
        <Toaster position="top-right" richColors />
      </BrowserRouter>
    </TaktProvider>
  );
}

export default App;

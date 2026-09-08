import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Kiosk from "@/pages/Kiosk";
import Login from "@/pages/Login";
import AdminLayout from "@/pages/AdminLayout";
import Dashboard from "@/pages/Dashboard";
import Employees from "@/pages/Employees";
import Schedules from "@/pages/Schedules";
import Timesheets from "@/pages/Timesheets";
import Payroll from "@/pages/Payroll";
import Reports from "@/pages/Reports";
import History from "@/pages/History";
import AuditLog from "@/pages/AuditLog";
import Settings from "@/pages/Settings";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App grain">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Kiosk />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin" element={<Protected><AdminLayout /></Protected>}>
              <Route index element={<Dashboard />} />
              <Route path="employees" element={<Employees />} />
              <Route path="schedules" element={<Schedules />} />
              <Route path="timesheets" element={<Timesheets />} />
              <Route path="payroll" element={<Payroll />} />
              <Route path="reports" element={<Reports />} />
              <Route path="history" element={<History />} />
              <Route path="audit" element={<AuditLog />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors theme="dark" />
      </AuthProvider>
    </div>
  );
}

export default App;

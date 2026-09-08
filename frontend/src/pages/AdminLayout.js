import { useEffect, useRef, useCallback } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { setStoreTz, useClock } from "@/lib/time";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  LayoutDashboard, Users, CalendarDays, ClipboardList, DollarSign,
  BarChart3, History as HistoryIcon, ScrollText, Settings as Cog, LogOut, Clock, Monitor, Menu, X,
} from "lucide-react";
import { useState } from "react";

const NAV = [
  { to: "/admin", end: true, label: "Live Dashboard", icon: LayoutDashboard, testid: "nav-tab-dashboard" },
  { to: "/admin/employees", label: "Employees", icon: Users, testid: "nav-tab-employees" },
  { to: "/admin/schedules", label: "Schedules", icon: CalendarDays, testid: "nav-tab-schedules" },
  { to: "/admin/timesheets", label: "Timesheets", icon: ClipboardList, testid: "nav-tab-timesheets" },
  { to: "/admin/payroll", label: "Payroll Estimate", icon: DollarSign, testid: "nav-tab-payroll" },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, testid: "nav-tab-reports" },
  { to: "/admin/history", label: "Attendance History", icon: HistoryIcon, testid: "nav-tab-history" },
  { to: "/admin/audit", label: "Audit Log", icon: ScrollText, testid: "nav-tab-audit" },
  { to: "/admin/settings", label: "Store Settings", icon: Cog, testid: "nav-tab-settings" },
];

const IDLE_MS = 15 * 60 * 1000;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const now = useClock();
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const resetIdle = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      toast.info("Signed out due to inactivity");
      logout();
    }, IDLE_MS);
  }, [logout]);

  useEffect(() => {
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetIdle));
    resetIdle();
    return () => { events.forEach((e) => window.removeEventListener(e, resetIdle)); if (timer.current) clearTimeout(timer.current); };
  }, [resetIdle]);

  useEffect(() => {
    api.get("/settings").then((r) => setStoreTz(r.data.timezone)).catch(() => {});
  }, []);

  if (!user) return null;
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "America/New_York" });

  const nav = user.role === "supervisor"
    ? NAV.filter((n) => !["/admin/settings", "/admin/audit"].includes(n.to))
    : NAV;

  return (
    <div className="min-h-screen flex bg-[#090A0F]">
      {/* Sidebar */}
      <aside className={`fixed lg:static z-40 inset-y-0 left-0 w-64 bg-[#0d0f16] border-r border-[#282C3D] flex flex-col transition-transform ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="flex items-center gap-3 px-5 py-5 border-b border-[#282C3D]">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
            <Clock className="w-5 h-5 text-slate-950" strokeWidth={2.5} />
          </div>
          <div className="leading-tight">
            <div className="font-extrabold text-sm">Southgate</div>
            <div className="text-xs text-slate-500">Smoke Shop</div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map((n) => {
            const Icon = n.icon;
            return (
              <NavLink key={n.to} to={n.to} end={n.end} data-testid={n.testid} onClick={() => setOpen(false)}
                className={({ isActive }) => `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${isActive ? "bg-amber-500/15 text-amber-400 border border-amber-500/30" : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"}`}>
                <Icon className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> {n.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-[#282C3D] space-y-1">
          <NavLink to="/" data-testid="nav-tab-kiosk" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-amber-400 hover:bg-white/5 transition-all">
            <Monitor className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> Kiosk Mode
          </NavLink>
          <button data-testid="logout-btn" onClick={logout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-400 hover:text-rose-400 hover:bg-white/5 transition-all">
            <LogOut className="w-4.5 h-4.5" style={{ width: 18, height: 18 }} /> Sign Out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center justify-between px-4 sm:px-8 py-4 border-b border-[#282C3D] bg-[#0d0f16]/60 backdrop-blur-xl sticky top-0 z-20">
          <button className="lg:hidden text-slate-400" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
          <div className="hidden sm:block font-mono-digits text-amber-400 font-bold tabular-nums">{timeStr}</div>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-bold">{user.full_name}</div>
              <div className="text-xs text-slate-500 capitalize">{user.role}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-sm font-black text-amber-400">
              {user.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </div>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <Outlet context={{ user }} />
        </main>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { useClock, fmtTime, fmtHours, fmtDate } from "@/lib/time";
import { toast } from "sonner";
import {
  LogIn, LogOut, Coffee, Play, Delete, ShieldCheck, Clock, X,
  CalendarClock, User2, ArrowRight,
} from "lucide-react";

const STORE_NAME = "Southgate Smoke Shop";

function Digit({ value }) {
  return (
    <div className="w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 border-amber-500/60 flex items-center justify-center">
      {value && <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-amber-400" />}
    </div>
  );
}

const ACTIONS = {
  clocked_out: [
    { key: "clock_in", label: "Clock In", icon: LogIn, cls: "from-emerald-600 to-teal-500 text-white", ring: "shadow-[0_0_35px_rgba(16,185,129,0.35)]" },
  ],
  clocked_in: [
    { key: "start_break", label: "Start Break", icon: Coffee, cls: "from-amber-500 to-yellow-500 text-slate-950", ring: "shadow-[0_0_35px_rgba(245,158,11,0.3)]" },
    { key: "clock_out", label: "Clock Out", icon: LogOut, cls: "from-rose-600 to-red-500 text-white", ring: "shadow-[0_0_35px_rgba(244,63,94,0.3)]" },
  ],
  on_break: [
    { key: "end_break", label: "End Break", icon: Play, cls: "from-sky-600 to-blue-500 text-white", ring: "shadow-[0_0_35px_rgba(56,189,248,0.3)]" },
  ],
};

const STATUS_META = {
  clocked_in: { label: "CLOCKED IN", cls: "text-emerald-400 border-emerald-500/50 bg-emerald-950/60" },
  on_break: { label: "ON BREAK", cls: "text-amber-400 border-amber-500/50 bg-amber-950/60" },
  clocked_out: { label: "CLOCKED OUT", cls: "text-slate-400 border-slate-600/50 bg-slate-800/50" },
};

export default function Kiosk() {
  const now = useClock();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [pin, setPin] = useState("");
  const [session, setSession] = useState(null); // verified employee session
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState(null); // my timesheet data

  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "America/New_York" });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/New_York" });

  const pressNum = (n) => { if (pin.length < 6) setPin(pin + n); };
  const backspace = () => setPin(pin.slice(0, -1));
  const clearPin = () => setPin("");

  const verify = useCallback(async () => {
    if (!identifier.trim()) { toast.error("Enter your Employee ID or username"); return; }
    if (pin.length < 4) { toast.error("Enter your 4-6 digit PIN"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/kiosk/verify", { identifier: identifier.trim(), pin });
      setSession(data);
    } catch (e) {
      toast.error(apiError(e, "Invalid ID or PIN"));
      setPin("");
    } finally { setBusy(false); }
  }, [identifier, pin]);

  const doAction = async (action) => {
    setBusy(true);
    try {
      const { data } = await api.post("/kiosk/action", { identifier: identifier.trim(), pin, action });
      toast.success(data.message);
      // refresh session
      const { data: v } = await api.post("/kiosk/verify", { identifier: identifier.trim(), pin });
      setSession(v);
      if (action === "clock_out") {
        setTimeout(() => resetAll(), 2200);
      }
    } catch (e) {
      toast.error(apiError(e, "Action failed"));
    } finally { setBusy(false); }
  };

  const loadSheet = async () => {
    try {
      const { data } = await api.post("/kiosk/my-timesheet", { identifier: identifier.trim(), pin });
      setSheet(data);
    } catch (e) { toast.error(apiError(e)); }
  };

  const resetAll = () => { setSession(null); setSheet(null); setPin(""); setIdentifier(""); };

  // auto reset idle after inactivity on employee panel
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => resetAll(), 40000);
    return () => clearTimeout(t);
  }, [session]);

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#090A0F]">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-32 w-[480px] h-[480px] rounded-full bg-emerald-500/10 blur-[120px]" />

      {/* Top banner */}
      <header className="relative z-10 flex items-center justify-between px-5 sm:px-10 py-5 border-b border-[#282C3D]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg">
            <Clock className="w-6 h-6 text-slate-950" strokeWidth={2.5} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight leading-none">{STORE_NAME}</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">Employee Time Clock</p>
          </div>
        </div>
        <div className="text-right">
          <div data-testid="kiosk-live-clock" className="font-mono-digits text-2xl sm:text-4xl font-black text-amber-400 tracking-wider tabular-nums drop-shadow-[0_0_20px_rgba(245,158,11,0.25)]">{timeStr}</div>
          <div className="text-xs sm:text-sm text-slate-500 font-medium">{dateStr}</div>
        </div>
      </header>

      <button
        data-testid="admin-login-link"
        onClick={() => navigate("/login")}
        className="absolute top-24 sm:top-28 right-5 sm:right-10 z-20 flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-amber-400 transition-colors"
      >
        <ShieldCheck className="w-4 h-4" /> Manager Login
      </button>

      <main className="relative z-10 max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
        {!session ? (
          <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 items-start max-w-3xl mx-auto animate-fade-up">
            <div className="rounded-3xl bg-[#181A24] border border-[#282C3D] p-6 sm:p-8 shadow-2xl">
              <label className="text-sm font-semibold text-slate-300 mb-2 block">Employee ID or Username</label>
              <input
                data-testid="kiosk-identifier-input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verify()}
                placeholder="e.g. EMP102"
                className="w-full h-14 rounded-2xl bg-[#0F1118] border border-[#282C3D] px-5 text-lg font-medium text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none transition-colors mb-6"
              />
              <label className="text-sm font-semibold text-slate-300 mb-3 block">Enter PIN</label>
              <div className="flex items-center gap-3 mb-6" data-testid="kiosk-pin-display">
                {[0, 1, 2, 3, 4, 5].map((i) => <Digit key={i} value={pin[i]} />)}
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <button
                    key={n}
                    data-testid={`kiosk-pin-num-${n}`}
                    onClick={() => pressNum(String(n))}
                    className="h-16 text-2xl font-mono-digits font-bold rounded-2xl bg-[#1F2230] border border-[#2f3446] text-white hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 active:scale-95 transition-all"
                  >{n}</button>
                ))}
                <button data-testid="kiosk-pin-clear" onClick={clearPin} className="h-16 rounded-2xl bg-[#1F2230] border border-[#2f3446] text-slate-400 hover:text-rose-400 active:scale-95 transition-all flex items-center justify-center text-sm font-bold">CLR</button>
                <button data-testid="kiosk-pin-num-0" onClick={() => pressNum("0")} className="h-16 text-2xl font-mono-digits font-bold rounded-2xl bg-[#1F2230] border border-[#2f3446] text-white hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 active:scale-95 transition-all">0</button>
                <button data-testid="kiosk-pin-back" onClick={backspace} className="h-16 rounded-2xl bg-[#1F2230] border border-[#2f3446] text-slate-400 hover:text-amber-400 active:scale-95 transition-all flex items-center justify-center"><Delete className="w-6 h-6" /></button>
              </div>
            </div>

            <div className="flex flex-col justify-center h-full py-4">
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">Welcome back 👋</h2>
              <p className="text-slate-400 mb-8 leading-relaxed">Enter your Employee ID and PIN, then tap continue to clock in, take a break, or clock out.</p>
              <button
                data-testid="kiosk-continue-btn"
                onClick={verify}
                disabled={busy}
                className="h-16 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 text-lg font-black uppercase tracking-wide flex items-center justify-center gap-3 hover:from-amber-300 hover:to-amber-500 active:scale-[0.98] transition-all shadow-[0_0_35px_rgba(245,158,11,0.3)] disabled:opacity-60"
              >
                {busy ? "Checking…" : <>Continue <ArrowRight className="w-6 h-6" /></>}
              </button>
            </div>
          </div>
        ) : (
          <EmployeePanel
            session={session} busy={busy} onAction={doAction}
            onExit={resetAll} sheet={sheet} onLoadSheet={loadSheet} onCloseSheet={() => setSheet(null)}
          />
        )}
      </main>
    </div>
  );
}

function EmployeePanel({ session, busy, onAction, onExit, sheet, onLoadSheet, onCloseSheet }) {
  const emp = session.employee;
  const status = session.status;
  const meta = STATUS_META[status];
  const actions = ACTIONS[status] || [];
  const initials = emp.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("");

  return (
    <div className="animate-fade-up max-w-4xl mx-auto">
      <div className="rounded-3xl bg-[#181A24] border border-[#282C3D] p-6 sm:p-8 shadow-2xl mb-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-2xl font-black text-amber-400">{initials}</div>
            <div>
              <h2 className="text-2xl font-extrabold tracking-tight">{emp.full_name}</h2>
              <p className="text-sm text-slate-500 capitalize">{emp.role} · ID {emp.employee_id}</p>
            </div>
          </div>
          <div className="text-right">
            <span data-testid="kiosk-status-badge" className={`inline-block px-4 py-2 rounded-full border text-sm font-bold tracking-wide ${meta.cls}`}>{meta.label}</span>
            <div className="text-sm text-slate-400 mt-2">Today: <span className="font-bold text-white">{fmtHours(session.today_hours)}</span></div>
          </div>
        </div>

        {session.current_timecard && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <InfoPill label="Clocked in at" value={fmtTime(session.current_timecard.clock_in)} />
            {session.schedule_today && <InfoPill label="Scheduled" value={`${session.schedule_today.shift_start} - ${session.schedule_today.shift_end}`} />}
            {session.current_timecard.late_minutes > 0 && <InfoPill label="Late by" value={`${session.current_timecard.late_minutes} min`} danger />}
          </div>
        )}
      </div>

      <div className={`grid gap-4 sm:gap-6 mb-6 ${actions.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"}`}>
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              data-testid={`kiosk-${a.key.replace("_", "-")}-btn`}
              disabled={busy}
              onClick={() => onAction(a.key)}
              className={`h-32 sm:h-40 rounded-3xl bg-gradient-to-r ${a.cls} ${a.ring} flex flex-col items-center justify-center gap-3 text-2xl sm:text-3xl font-black uppercase tracking-wider active:scale-[0.97] transition-all disabled:opacity-60`}
            >
              <Icon className="w-10 h-10 sm:w-12 sm:h-12" strokeWidth={2.5} />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button data-testid="kiosk-my-hours-btn" onClick={onLoadSheet} className="flex items-center gap-2 text-sm font-semibold text-slate-300 hover:text-amber-400 transition-colors px-4 py-3 rounded-xl border border-[#282C3D] bg-[#181A24]">
          <CalendarClock className="w-4 h-4" /> View My Hours & Schedule
        </button>
        <button data-testid="kiosk-exit-btn" onClick={onExit} className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-rose-400 transition-colors px-4 py-3">
          <X className="w-4 h-4" /> Done
        </button>
      </div>

      {sheet && <SheetModal sheet={sheet} onClose={onCloseSheet} />}
    </div>
  );
}

function InfoPill({ label, value, danger }) {
  return (
    <div className="rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-bold ${danger ? "text-rose-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

function SheetModal({ sheet, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-[#181A24] border border-[#282C3D] p-6 shadow-2xl animate-fade-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-extrabold flex items-center gap-2"><User2 className="w-5 h-5 text-amber-400" /> {sheet.employee.full_name}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-5">
          <span className="text-sm text-slate-300">Last 14 days total: </span>
          <span className="font-black text-amber-400 text-lg">{fmtHours(sheet.total_hours)}</span>
        </div>
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2">Recent Timecards</h4>
        <div className="space-y-2 mb-6">
          {sheet.timecards.length === 0 && <p className="text-slate-600 text-sm">No records yet.</p>}
          {sheet.timecards.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 py-3 text-sm">
              <div>
                <div className="font-semibold">{fmtDate(t.date)}</div>
                <div className="text-slate-500 text-xs">{fmtTime(t.clock_in)} → {t.clock_out ? fmtTime(t.clock_out) : "—"}</div>
              </div>
              <div className="text-right">
                <div className="font-bold">{fmtHours(t.worked_hours)}</div>
                {t.late_minutes > 0 && <div className="text-xs text-rose-400">{t.late_minutes}m late</div>}
              </div>
            </div>
          ))}
        </div>
        <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wide mb-2">Upcoming Schedule</h4>
        <div className="space-y-2">
          {sheet.schedules.length === 0 && <p className="text-slate-600 text-sm">No upcoming shifts scheduled.</p>}
          {sheet.schedules.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 py-3 text-sm">
              <span className="font-semibold">{fmtDate(s.date)}</span>
              <span className="text-amber-400 font-mono-digits font-bold">{s.shift_start} – {s.shift_end}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

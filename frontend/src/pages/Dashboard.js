import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, EmptyState, StatusBadge } from "@/components/shared";
import { fmtTime, fmtHours, fmtDateTime } from "@/lib/time";
import { Users, Coffee, UserX, AlertTriangle, Clock, Activity } from "lucide-react";

const STAT_CARDS = [
  { key: "currently_working", label: "Currently Working", icon: Users, color: "emerald" },
  { key: "on_break", label: "On Break", icon: Coffee, color: "amber" },
  { key: "not_clocked_in", label: "Not Clocked In", icon: UserX, color: "slate" },
  { key: "late", label: "Late Today", icon: AlertTriangle, color: "rose" },
  { key: "total_hours", label: "Today's Total Hours", icon: Clock, color: "sky", hours: true },
];

const COLORS = {
  emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
  amber: "text-amber-400 bg-amber-500/10 border-amber-500/25",
  slate: "text-slate-300 bg-slate-500/10 border-slate-500/25",
  rose: "text-rose-400 bg-rose-500/10 border-rose-500/25",
  sky: "text-sky-400 bg-sky-500/10 border-sky-500/25",
};

export default function Dashboard() {
  const { data } = useQuery({
    queryKey: ["dashboard-live"],
    queryFn: async () => (await api.get("/dashboard/live")).data,
    refetchInterval: 5000,
  });
  const { data: activity } = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: async () => (await api.get("/dashboard/activity")).data,
    refetchInterval: 7000,
  });

  const stats = data?.stats || {};
  const employees = data?.employees || [];

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 animate-fade-up">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
        </span>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Live Dashboard</h1>
        <span className="text-sm text-slate-500 ml-2">Auto-updating every 5s</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
        {STAT_CARDS.map((c) => {
          const Icon = c.icon;
          const val = c.hours ? fmtHours(stats[c.key]) : (stats[c.key] ?? 0);
          return (
            <Card key={c.key} className="p-5 animate-fade-up" >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${COLORS[c.color]}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div data-testid={`stat-${c.key}`} className="text-2xl sm:text-3xl font-black tracking-tight">{val}</div>
              <div className="text-xs text-slate-500 font-medium mt-1">{c.label}</div>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold mb-3">Employee Status</h2>
          {employees.length === 0 ? (
            <Card><EmptyState icon={Users} title="No active employees" hint="Add employees to get started." /></Card>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3" data-testid="employee-status-grid">
              {employees.map((e) => (
                <Card key={e.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-sm font-black text-amber-400 shrink-0">
                      {e.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{e.full_name}</div>
                      <div className="text-xs text-slate-500">
                        {e.clock_in_time ? `In: ${fmtTime(e.clock_in_time)}` : "Not clocked in"} · {fmtHours(e.worked_hours)}
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={e.status} late={e.is_late} />
                </Card>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Activity className="w-4 h-4 text-amber-400" /> Recent Activity</h2>
          <Card className="p-4">
            {(!activity || activity.length === 0) ? (
              <EmptyState icon={Activity} title="No activity today" />
            ) : (
              <div className="space-y-3 max-h-[420px] overflow-y-auto">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-[#282C3D] last:border-0 pb-3 last:pb-0">
                    <div>
                      <div className="font-semibold">{a.name}</div>
                      <div className="text-xs text-slate-500">{a.action}</div>
                    </div>
                    <div className="text-xs text-slate-400 font-mono-digits">{fmtTime(a.time)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

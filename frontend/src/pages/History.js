import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, inputCls, EmptyState } from "@/components/shared";
import { fmtTime, fmtDate, fmtHours } from "@/lib/time";
import { History as HistoryIcon } from "lucide-react";

export default function History() {
  const [empFilter, setEmpFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [flag, setFlag] = useState("all"); // all | late | missing

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get("/employees")).data });

  const params = {};
  if (empFilter !== "all") params.user_id = empFilter;
  if (status !== "all") params.status = status;
  if (start) params.start = start;
  if (end) params.end = end;
  if (flag === "late") params.late = true;
  if (flag === "missing") params.missing_out = true;

  const { data: cards = [] } = useQuery({ queryKey: ["history", params], queryFn: async () => (await api.get("/timecards", { params })).data });

  return (
    <div>
      <PageHeader title="Attendance History" subtitle="Searchable log of every clock event." />

      <Card className="p-4 mb-5">
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select data-testid="history-emp-filter" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={inputCls}>
            <option value="all">All Employees</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="all">Any Status</option>
            <option value="clocked_in">Clocked In</option>
            <option value="on_break">On Break</option>
            <option value="clocked_out">Clocked Out</option>
          </select>
          <select value={flag} onChange={(e) => setFlag(e.target.value)} className={inputCls}>
            <option value="all">All Records</option>
            <option value="late">Late Only</option>
            <option value="missing">Missing Clock-Out</option>
          </select>
          <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" className={inputCls} value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </Card>

      {cards.length === 0 ? (
        <Card><EmptyState icon={HistoryIcon} title="No records match your filters" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-[#282C3D] text-slate-400">
                <th className="text-left p-4 font-bold">Employee</th>
                <th className="text-left p-4 font-bold">Date</th>
                <th className="text-left p-4 font-bold">Clock In</th>
                <th className="text-left p-4 font-bold">Clock Out</th>
                <th className="text-left p-4 font-bold">Breaks</th>
                <th className="text-left p-4 font-bold">Hours</th>
                <th className="text-left p-4 font-bold">Flags</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b border-[#282C3D] last:border-0">
                  <td className="p-4 font-semibold">{c.employee_name}</td>
                  <td className="p-4 text-slate-400">{fmtDate(c.date)}</td>
                  <td className="p-4 font-mono-digits">{fmtTime(c.clock_in)}</td>
                  <td className="p-4 font-mono-digits">{c.clock_out ? fmtTime(c.clock_out) : "—"}</td>
                  <td className="p-4 text-slate-400">{c.breaks.length}</td>
                  <td className="p-4 font-bold text-amber-400">{fmtHours(c.worked_hours)}</td>
                  <td className="p-4 space-x-1">
                    {c.late_minutes > 0 && <span className="text-xs px-2 py-0.5 rounded bg-rose-950/50 text-rose-400 font-bold">Late {c.late_minutes}m</span>}
                    {!c.clock_out && <span className="text-xs px-2 py-0.5 rounded bg-amber-950/50 text-amber-400 font-bold">Missing Out</span>}
                    {c.edited && <span className="text-xs px-2 py-0.5 rounded bg-sky-950/50 text-sky-400 font-bold">Edited</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

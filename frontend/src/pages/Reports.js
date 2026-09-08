import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, Btn, inputCls, EmptyState } from "@/components/shared";
import { fmtHours } from "@/lib/time";
import { toast } from "sonner";
import { BarChart3, FileDown, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "This Month" },
  { key: "custom", label: "Custom" },
];

export default function Reports() {
  const [range, setRange] = useState("this_week");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const params = { range_key: range };
  if (range === "custom" && start && end) { params.start = start; params.end = end; }

  const { data } = useQuery({
    queryKey: ["reports", params],
    queryFn: async () => (await api.get("/reports", { params })).data,
    enabled: range !== "custom" || (!!start && !!end),
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const chartData = rows.map((r) => ({ name: r.employee_name.split(" ")[0], hours: r.total_hours }));

  const doExport = async (fmt) => {
    try {
      const res = await api.get("/reports/export", { params: { ...params, fmt }, responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `southgate_report_${data?.start || "range"}.${fmt}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success(`${fmt.toUpperCase()} downloaded`);
    } catch { toast.error("Export failed"); }
  };

  return (
    <div>
      <PageHeader title="Reports" subtitle="Hours, breaks, punctuality and estimated pay by employee.">
        <Btn variant="ghost" data-testid="export-csv-button" onClick={() => doExport("csv")}><FileDown className="w-4 h-4" /> CSV</Btn>
        <Btn data-testid="export-pdf-button" onClick={() => doExport("pdf")}><FileText className="w-4 h-4" /> PDF</Btn>
      </PageHeader>

      <div className="flex gap-2 mb-5 flex-wrap items-center" data-testid="filter-date-range">
        <div className="flex gap-1 bg-[#181A24] border border-[#282C3D] rounded-xl p-1 flex-wrap">
          {RANGES.map((r) => (
            <button key={r.key} data-testid={`report-range-${r.key}`} onClick={() => setRange(r.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${range === r.key ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{r.label}</button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex gap-2 items-center">
            <input type="date" className={inputCls + " w-auto"} value={start} onChange={(e) => setStart(e.target.value)} />
            <span className="text-slate-500">to</span>
            <input type="date" className={inputCls + " w-auto"} value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Total Hours</div><div className="text-3xl font-black">{fmtHours(totals.total_hours)}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Late Arrivals</div><div className="text-3xl font-black text-rose-400">{totals.late_arrivals || 0}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Est. Pay</div><div className="text-3xl font-black text-emerald-400">${(totals.estimated_pay || 0).toFixed(2)}</div></Card>
      </div>

      {chartData.length > 0 && (
        <Card className="p-5 mb-6">
          <h3 className="font-bold mb-4">Hours Worked by Employee</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#282C3D" />
              <XAxis dataKey="name" stroke="#64748B" fontSize={12} />
              <YAxis stroke="#64748B" fontSize={12} />
              <Tooltip contentStyle={{ background: "#181A24", border: "1px solid #282C3D", borderRadius: 12 }} />
              <Bar dataKey="hours" fill="#F59E0B" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {rows.length === 0 ? (
        <Card><EmptyState icon={BarChart3} title="No data for this range" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead>
              <tr className="border-b border-[#282C3D] text-slate-400">
                <th className="text-left p-4 font-bold">Employee</th>
                <th className="text-right p-4 font-bold">Total Hours</th>
                <th className="text-right p-4 font-bold">Break Hours</th>
                <th className="text-right p-4 font-bold">Late</th>
                <th className="text-right p-4 font-bold">Missing Out</th>
                <th className="text-right p-4 font-bold">Est. Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-[#282C3D] last:border-0">
                  <td className="p-4 font-semibold">{r.employee_name}</td>
                  <td className="p-4 text-right font-mono-digits">{fmtHours(r.total_hours)}</td>
                  <td className="p-4 text-right font-mono-digits">{fmtHours(r.break_hours)}</td>
                  <td className="p-4 text-right">{r.late_arrivals}</td>
                  <td className="p-4 text-right">{r.missing_out}</td>
                  <td className="p-4 text-right font-bold text-emerald-400 font-mono-digits">${r.estimated_pay.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

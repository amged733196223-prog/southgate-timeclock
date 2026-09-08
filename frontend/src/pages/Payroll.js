import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { PageHeader, Card, EmptyState } from "@/components/shared";
import { fmtHours } from "@/lib/time";
import { DollarSign, Lock } from "lucide-react";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "This Month" },
];

export default function Payroll() {
  const [range, setRange] = useState("this_week");
  const { data, isError, error } = useQuery({
    queryKey: ["payroll", range],
    queryFn: async () => (await api.get("/payroll", { params: { range_key: range } })).data,
    retry: false,
  });

  if (isError) {
    return (
      <div>
        <PageHeader title="Payroll Estimate" />
        <Card><EmptyState icon={Lock} title="Not permitted" hint={apiError(error)} /></Card>
      </div>
    );
  }

  const rows = data?.rows || [];
  const totals = data?.totals || {};

  return (
    <div>
      <PageHeader title="Payroll Estimate" subtitle="Estimate only · hourly rate × total worked hours. No overtime applied." />
      <div className="flex gap-1 bg-[#181A24] border border-[#282C3D] rounded-xl p-1 mb-5 w-fit">
        {RANGES.map((r) => (
          <button key={r.key} data-testid={`payroll-range-${r.key}`} onClick={() => setRange(r.key)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${range === r.key ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{r.label}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Total Hours</div><div className="text-3xl font-black">{fmtHours(totals.total_hours)}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Est. Gross Pay</div><div className="text-3xl font-black text-emerald-400">${(totals.estimated_pay || 0).toFixed(2)}</div></Card>
        <Card className="p-5"><div className="text-xs text-slate-500 mb-1">Employees Paid</div><div className="text-3xl font-black">{rows.length}</div></Card>
      </div>

      {rows.length === 0 ? (
        <Card><EmptyState icon={DollarSign} title="No payroll data for this period" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[#282C3D] text-slate-400">
                <th className="text-left p-4 font-bold">Employee</th>
                <th className="text-right p-4 font-bold">Total Hours</th>
                <th className="text-right p-4 font-bold">Hourly Rate</th>
                <th className="text-right p-4 font-bold">Estimated Gross Pay</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.user_id} className="border-b border-[#282C3D] last:border-0">
                  <td className="p-4 font-semibold">{r.employee_name}</td>
                  <td className="p-4 text-right font-mono-digits">{fmtHours(r.total_hours)}</td>
                  <td className="p-4 text-right font-mono-digits">${r.hourly_rate.toFixed(2)}</td>
                  <td className="p-4 text-right font-bold text-emerald-400 font-mono-digits">${r.estimated_pay.toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-amber-500/5">
                <td className="p-4 font-black">TOTAL</td>
                <td className="p-4 text-right font-black font-mono-digits">{fmtHours(totals.total_hours)}</td>
                <td className="p-4"></td>
                <td className="p-4 text-right font-black text-emerald-400 font-mono-digits">${(totals.estimated_pay || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

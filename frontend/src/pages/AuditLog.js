import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, EmptyState } from "@/components/shared";
import { fmtDateTime } from "@/lib/time";
import { ScrollText } from "lucide-react";

const ACTION_LABEL = {
  create: "Created", update: "Updated", delete: "Deleted",
  edit: "Corrected", manual_create: "Manual Entry",
};
const ENTITY_LABEL = { employee: "Employee", timecard: "Attendance", settings: "Settings" };

export default function AuditLog() {
  const { data: logs = [] } = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get("/audit-logs")).data });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Permanent, tamper-evident record of every admin change. Original values are never overwritten." />
      {logs.length === 0 ? (
        <Card><EmptyState icon={ScrollText} title="No audit entries yet" /></Card>
      ) : (
        <div className="space-y-3">
          {logs.map((l) => (
            <Card key={l.id} className="p-5">
              <div className="flex items-start justify-between flex-wrap gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-1 rounded bg-amber-500/10 text-amber-400">{ENTITY_LABEL[l.entity] || l.entity}</span>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-slate-500/10 text-slate-300">{ACTION_LABEL[l.action] || l.action}</span>
                  <span className="font-semibold text-sm">by {l.changed_by_name}</span>
                </div>
                <span className="text-xs text-slate-500 font-mono-digits">{fmtDateTime(l.timestamp)}</span>
              </div>
              {l.reason && <p className="text-sm text-slate-400 mb-3">Reason: <span className="text-slate-200">{l.reason}</span></p>}
              {l.changes && l.changes.length > 0 && (
                <div className="space-y-1.5">
                  {l.changes.map((c, i) => (
                    <div key={i} className="text-xs bg-[#0F1118] rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-400 capitalize">{c.field.replace("_", " ")}:</span>
                      <span className="text-rose-400 line-through font-mono-digits">{c.original || "—"}</span>
                      <span className="text-slate-600">→</span>
                      <span className="text-emerald-400 font-mono-digits">{c.new || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

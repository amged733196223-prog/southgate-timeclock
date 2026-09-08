import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Modal, EmptyState } from "@/components/shared";
import { toast } from "sonner";
import { Plus, Trash2, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

function startOfWeek(d) {
  const dt = new Date(d);
  const day = (dt.getDay() + 6) % 7; // Monday=0
  dt.setDate(dt.getDate() - day);
  dt.setHours(12, 0, 0, 0);
  return dt;
}
function iso(d) { return d.toISOString().slice(0, 10); }
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function Schedules() {
  const { user } = useOutletContext();
  const isOwner = user.role === "owner";
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [modal, setModal] = useState(null); // {user_id, date}
  const [form, setForm] = useState({ shift_start: "10:00", shift_end: "18:00" });

  const weekDates = DAYS.map((_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const start = iso(weekDates[0]);
  const end = iso(weekDates[6]);

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get("/employees")).data });
  const { data: schedules = [] } = useQuery({ queryKey: ["schedules", start, end], queryFn: async () => (await api.get("/schedules", { params: { start, end } })).data });

  const activeEmps = employees.filter((e) => e.active);
  const schedMap = {};
  schedules.forEach((s) => { schedMap[`${s.user_id}_${s.date}`] = s; });

  const openCell = (emp, date) => {
    if (!isOwner) return;
    const existing = schedMap[`${emp.id}_${iso(date)}`];
    setForm(existing ? { shift_start: existing.shift_start, shift_end: existing.shift_end } : { shift_start: "10:00", shift_end: "18:00" });
    setModal({ user_id: emp.id, name: emp.full_name, date: iso(date), existing });
  };

  const save = async () => {
    try {
      await api.post("/schedules", { user_id: modal.user_id, date: modal.date, ...form });
      toast.success("Shift saved");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setModal(null);
    } catch (e) { toast.error(apiError(e)); }
  };
  const removeShift = async () => {
    try { await api.delete(`/schedules/${modal.existing.id}`); toast.success("Shift removed"); qc.invalidateQueries({ queryKey: ["schedules"] }); setModal(null); }
    catch (e) { toast.error(apiError(e)); }
  };

  const shiftWeek = (dir) => { const d = new Date(weekStart); d.setDate(d.getDate() + dir * 7); setWeekStart(d); };

  return (
    <div>
      <PageHeader title="Work Schedules" subtitle="Assign weekly shifts. Late flags compare against these times.">
        <Btn variant="ghost" onClick={() => shiftWeek(-1)}><ChevronLeft className="w-4 h-4" /></Btn>
        <span className="text-sm font-bold px-2">{weekDates[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {weekDates[6].toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        <Btn variant="ghost" onClick={() => shiftWeek(1)}><ChevronRight className="w-4 h-4" /></Btn>
      </PageHeader>

      {activeEmps.length === 0 ? (
        <Card><EmptyState icon={CalendarDays} title="No active employees to schedule" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-[#282C3D]">
                <th className="text-left p-4 font-bold text-slate-400 sticky left-0 bg-[#181A24]">Employee</th>
                {weekDates.map((d, i) => (
                  <th key={i} className="p-3 font-bold text-slate-400 text-center min-w-[110px]">
                    <div>{DAYS[i]}</div>
                    <div className="text-xs text-slate-600 font-medium">{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeEmps.map((emp) => (
                <tr key={emp.id} className="border-b border-[#282C3D] last:border-0">
                  <td className="p-4 font-semibold sticky left-0 bg-[#181A24]">{emp.full_name}</td>
                  {weekDates.map((d, i) => {
                    const s = schedMap[`${emp.id}_${iso(d)}`];
                    return (
                      <td key={i} className="p-2 text-center">
                        <button data-testid={`sched-cell-${emp.employee_id}-${i}`} onClick={() => openCell(emp, d)} disabled={!isOwner}
                          className={`w-full rounded-lg px-2 py-2 text-xs font-mono-digits font-bold transition-all ${s ? "bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25" : "text-slate-600 border border-dashed border-[#2f3446] hover:border-amber-500/40"} ${!isOwner && "cursor-default"}`}>
                          {s ? `${s.shift_start}–${s.shift_end}` : (isOwner ? "+ Add" : "—")}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {modal && (
        <Modal title={`${modal.existing ? "Edit" : "Add"} Shift · ${modal.name}`} onClose={() => setModal(null)}>
          <p className="text-sm text-slate-500 mb-4">{new Date(modal.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Shift Start"><input type="time" className={inputCls} value={form.shift_start} onChange={(e) => setForm({ ...form, shift_start: e.target.value })} /></Field>
            <Field label="Shift End"><input type="time" className={inputCls} value={form.shift_end} onChange={(e) => setForm({ ...form, shift_end: e.target.value })} /></Field>
          </div>
          <div className="flex gap-3 mt-6">
            {modal.existing && <Btn variant="danger" onClick={removeShift}><Trash2 className="w-4 h-4" /></Btn>}
            <Btn variant="ghost" className="flex-1 justify-center" onClick={() => setModal(null)}>Cancel</Btn>
            <Btn className="flex-1 justify-center" data-testid="sched-save" onClick={save}><Plus className="w-4 h-4" /> Save</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls, Modal, EmptyState } from "@/components/shared";
import { fmtTime, fmtHours, fmtDate } from "@/lib/time";
import { toast } from "sonner";
import { ClipboardList, Pencil, Plus, Lock } from "lucide-react";

const RANGES = [
  { key: "today", label: "Daily" },
  { key: "this_week", label: "Weekly" },
  { key: "biweekly", label: "Biweekly" },
  { key: "this_month", label: "Monthly" },
];

function localISO(dateStr, timeStr) {
  // build ISO from local date + HH:MM assuming America/New_York offset via Date
  return new Date(`${dateStr}T${timeStr}:00`).toISOString();
}

export default function Timesheets() {
  const { user } = useOutletContext();
  const isOwner = user.role === "owner";
  const qc = useQueryClient();
  const [range, setRange] = useState("this_week");
  const [empFilter, setEmpFilter] = useState("all");
  const [edit, setEdit] = useState(null);
  const [addNew, setAddNew] = useState(false);

  const today = new Date();
  const params = {};
  if (range === "today") { params.start = today.toISOString().slice(0, 10); params.end = params.start; }
  else if (range === "this_week") { const s = new Date(today); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); params.start = s.toISOString().slice(0, 10); params.end = today.toISOString().slice(0, 10); }
  else if (range === "biweekly") { const s = new Date(today); s.setDate(s.getDate() - 13); params.start = s.toISOString().slice(0, 10); params.end = today.toISOString().slice(0, 10); }
  else if (range === "this_month") { const s = new Date(today.getFullYear(), today.getMonth(), 1); params.start = s.toISOString().slice(0, 10); params.end = today.toISOString().slice(0, 10); }
  if (empFilter !== "all") params.user_id = empFilter;

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get("/employees")).data });
  const { data: cards = [] } = useQuery({ queryKey: ["timecards", params], queryFn: async () => (await api.get("/timecards", { params })).data });

  return (
    <div>
      <PageHeader title="Timesheets" subtitle="Total worked hours per shift. No overtime multiplier — all hours count normally.">
        {isOwner && <Btn data-testid="add-timecard-btn" onClick={() => setAddNew(true)}><Plus className="w-4 h-4" /> Manual Entry</Btn>}
      </PageHeader>

      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <div className="flex gap-1 bg-[#181A24] border border-[#282C3D] rounded-xl p-1">
          {RANGES.map((r) => (
            <button key={r.key} data-testid={`ts-range-${r.key}`} onClick={() => setRange(r.key)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${range === r.key ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>{r.label}</button>
          ))}
        </div>
        <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={inputCls + " w-auto ml-auto"}>
          <option value="all">All Employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
        </select>
      </div>

      {cards.length === 0 ? (
        <Card><EmptyState icon={ClipboardList} title="No timecards in this period" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-[#282C3D] text-slate-400">
                <th className="text-left p-4 font-bold">Employee</th>
                <th className="text-left p-4 font-bold">Date</th>
                <th className="text-left p-4 font-bold">Clock In</th>
                <th className="text-left p-4 font-bold">Clock Out</th>
                <th className="text-left p-4 font-bold">Breaks</th>
                <th className="text-left p-4 font-bold">Total</th>
                <th className="text-left p-4 font-bold">Late</th>
                {isOwner && <th className="p-4"></th>}
              </tr>
            </thead>
            <tbody>
              {cards.map((c) => (
                <tr key={c.id} className="border-b border-[#282C3D] last:border-0 hover:bg-white/[0.02]">
                  <td className="p-4 font-semibold">{c.employee_name}{c.edited && <span className="ml-2 text-xs text-amber-400">(edited)</span>}</td>
                  <td className="p-4 text-slate-400">{fmtDate(c.date)}</td>
                  <td className="p-4 font-mono-digits">{fmtTime(c.clock_in)}</td>
                  <td className="p-4 font-mono-digits">{c.clock_out ? fmtTime(c.clock_out) : <span className="text-rose-400">missing</span>}</td>
                  <td className="p-4 text-slate-400">{c.breaks.length}</td>
                  <td className="p-4 font-bold text-amber-400">{fmtHours(c.worked_hours)}</td>
                  <td className="p-4">{c.late_minutes > 0 ? <span className="text-rose-400 font-bold">{c.late_minutes}m</span> : <span className="text-slate-600">—</span>}</td>
                  {isOwner && <td className="p-4"><button data-testid={`edit-timecard-${c.id}`} onClick={() => setEdit(c)} className="text-slate-500 hover:text-amber-400"><Pencil className="w-4 h-4" /></button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {!isOwner && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500"><Lock className="w-3.5 h-3.5" /> Only the Owner can edit attendance records. All changes are recorded in the audit log.</div>
      )}

      {edit && <EditModal card={edit} onClose={() => setEdit(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ["timecards"] }); setEdit(null); }} />}
      {addNew && <AddModal employees={employees} onClose={() => setAddNew(false)} onSaved={() => { qc.invalidateQueries({ queryKey: ["timecards"] }); setAddNew(false); }} />}
    </div>
  );
}

function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function EditModal({ card, onClose, onSaved }) {
  const [clockIn, setClockIn] = useState(toLocalInput(card.clock_in));
  const [clockOut, setClockOut] = useState(toLocalInput(card.clock_out));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!reason.trim()) { toast.error("A reason is required for audit log"); return; }
    setBusy(true);
    try {
      await api.put(`/timecards/${card.id}`, {
        clock_in: new Date(clockIn).toISOString(),
        clock_out: clockOut ? new Date(clockOut).toISOString() : null,
        reason,
      });
      toast.success("Record corrected · logged to audit trail");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Correct Timecard · ${card.employee_name}`} onClose={onClose}>
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 mb-4 text-xs text-amber-300">
        Original values are preserved permanently in the audit log. A reason is mandatory.
      </div>
      <div className="grid grid-cols-1 gap-4">
        <Field label="Clock In"><input data-testid="edit-clockin" type="datetime-local" className={inputCls} value={clockIn} onChange={(e) => setClockIn(e.target.value)} /></Field>
        <Field label="Clock Out"><input data-testid="edit-clockout" type="datetime-local" className={inputCls} value={clockOut} onChange={(e) => setClockOut(e.target.value)} /></Field>
        <Field label="Reason for change *"><input data-testid="edit-reason" className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Employee forgot to clock out" /></Field>
      </div>
      <div className="flex gap-3 mt-6">
        <Btn variant="ghost" className="flex-1 justify-center" onClick={onClose}>Cancel</Btn>
        <Btn className="flex-1 justify-center" data-testid="edit-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save Correction"}</Btn>
      </div>
    </Modal>
  );
}

function AddModal({ employees, onClose, onSaved }) {
  const now = new Date();
  const [form, setForm] = useState({ user_id: "", date: now.toISOString().slice(0, 10), clock_in: toLocalInput(now.toISOString()), clock_out: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!form.user_id) { toast.error("Select an employee"); return; }
    if (!form.reason.trim()) { toast.error("A reason is required"); return; }
    setBusy(true);
    try {
      await api.post("/timecards", {
        user_id: form.user_id, date: form.date,
        clock_in: new Date(form.clock_in).toISOString(),
        clock_out: form.clock_out ? new Date(form.clock_out).toISOString() : null,
        reason: form.reason,
      });
      toast.success("Manual entry added · logged");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };
  return (
    <Modal title="Manual Time Entry" onClose={onClose}>
      <div className="grid gap-4">
        <Field label="Employee">
          <select data-testid="add-tc-emp" className={inputCls} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
            <option value="">Select…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
          </select>
        </Field>
        <Field label="Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Clock In"><input type="datetime-local" className={inputCls} value={form.clock_in} onChange={(e) => setForm({ ...form, clock_in: e.target.value })} /></Field>
        <Field label="Clock Out (optional)"><input type="datetime-local" className={inputCls} value={form.clock_out} onChange={(e) => setForm({ ...form, clock_out: e.target.value })} /></Field>
        <Field label="Reason *"><input className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Manual entry for missed punch" /></Field>
      </div>
      <div className="flex gap-3 mt-6">
        <Btn variant="ghost" className="flex-1 justify-center" onClick={onClose}>Cancel</Btn>
        <Btn className="flex-1 justify-center" data-testid="add-tc-save" disabled={busy} onClick={save}>{busy ? "Adding…" : "Add Entry"}</Btn>
      </div>
    </Modal>
  );
}

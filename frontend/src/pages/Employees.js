import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { api, apiError } from "@/lib/api";
import { PageHeader, Card, EmptyState, Btn, Field, inputCls, Modal } from "@/components/shared";
import { toast } from "sonner";
import { UserPlus, Pencil, Trash2, Users, Search, Phone, DollarSign } from "lucide-react";

const EMPTY = { full_name: "", employee_id: "", username: "", pin: "", password: "", phone: "", email: "", role: "employee", hourly_rate: "", hire_date: "", active: true };

export default function Employees() {
  const { user } = useOutletContext();
  const qc = useQueryClient();
  const isOwner = user.role === "owner";
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null | 'new' | employee
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);

  const { data: employees = [] } = useQuery({ queryKey: ["employees"], queryFn: async () => (await api.get("/employees")).data });

  const filtered = employees.filter((e) => {
    const m = e.full_name.toLowerCase().includes(search.toLowerCase()) || e.employee_id.toLowerCase().includes(search.toLowerCase());
    return m && (roleFilter === "all" || e.role === roleFilter);
  });

  const openNew = () => { setForm(EMPTY); setEditing("new"); };
  const openEdit = (e) => { setForm({ ...EMPTY, ...e, pin: "", password: "", hourly_rate: e.hourly_rate ?? "" }); setEditing(e); };

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form, hourly_rate: parseFloat(form.hourly_rate || 0) };
      if (editing === "new") {
        await api.post("/employees", payload);
        toast.success("Employee created");
      } else {
        const upd = { ...payload };
        if (!upd.pin) delete upd.pin;
        if (!upd.password) delete upd.password;
        await api.put(`/employees/${editing.id}`, upd);
        toast.success("Employee updated");
      }
      qc.invalidateQueries({ queryKey: ["employees"] });
      setEditing(null);
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const del = async () => {
    try {
      await api.delete(`/employees/${confirmDel.id}`);
      toast.success("Employee deleted");
      qc.invalidateQueries({ queryKey: ["employees"] });
      setConfirmDel(null);
    } catch (e) { toast.error(apiError(e)); }
  };

  const roleTag = { owner: "text-amber-400 bg-amber-500/10", supervisor: "text-sky-400 bg-sky-500/10", employee: "text-slate-300 bg-slate-500/10" };

  return (
    <div>
      <PageHeader title="Employees" subtitle={`${employees.length} team members`}>
        {isOwner && <Btn data-testid="add-employee-button" onClick={openNew}><UserPlus className="w-4 h-4" /> Add Employee</Btn>}
      </PageHeader>

      <div className="flex gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input data-testid="employee-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or ID…" className={inputCls + " pl-10"} />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={inputCls + " w-auto"}>
          <option value="all">All Roles</option>
          <option value="owner">Owner</option>
          <option value="supervisor">Supervisor</option>
          <option value="employee">Employee</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <Card><EmptyState icon={Users} title="No employees found" /></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="employee-list">
          {filtered.map((e) => (
            <Card key={e.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-base font-black text-amber-400">
                    {e.full_name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
                  </div>
                  <div>
                    <div className="font-bold">{e.full_name}</div>
                    <div className="text-xs text-slate-500">ID {e.employee_id}{e.username ? ` · @${e.username}` : ""}</div>
                  </div>
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded-md capitalize ${roleTag[e.role]}`}>{e.role}</span>
              </div>
              <div className="space-y-1.5 text-sm text-slate-400 mb-4">
                <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> {e.phone || "—"}</div>
                <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /> ${e.hourly_rate}/hr</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${e.active ? "bg-emerald-400" : "bg-slate-600"}`} />
                  {e.active ? "Active" : "Inactive"}
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-2">
                  <Btn variant="ghost" className="flex-1 justify-center" data-testid={`edit-employee-${e.employee_id}`} onClick={() => openEdit(e)}><Pencil className="w-3.5 h-3.5" /> Edit</Btn>
                  <Btn variant="ghost" className="!px-3" data-testid={`delete-employee-${e.employee_id}`} onClick={() => setConfirmDel(e)}><Trash2 className="w-4 h-4 text-rose-400" /></Btn>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <Modal wide title={editing === "new" ? "Add Employee" : `Edit ${editing.full_name}`} onClose={() => setEditing(null)}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full Name"><input data-testid="emp-form-name" className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
            <Field label="Employee ID"><input data-testid="emp-form-empid" className={inputCls} value={form.employee_id} onChange={(e) => setForm({ ...form, employee_id: e.target.value })} /></Field>
            <Field label="Username (for login)"><input data-testid="emp-form-username" className={inputCls} value={form.username || ""} onChange={(e) => setForm({ ...form, username: e.target.value })} /></Field>
            <Field label="Phone"><input className={inputCls} value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label={editing === "new" ? "PIN (4-6 digits)" : "New PIN (leave blank to keep)"}><input data-testid="emp-form-pin" className={inputCls} value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} maxLength={6} /></Field>
            <Field label="Hourly Rate ($)"><input data-testid="emp-form-rate" type="number" step="0.01" className={inputCls} value={form.hourly_rate} onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })} /></Field>
            <Field label="Role">
              <select data-testid="emp-form-role" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="employee">Employee</option>
                <option value="supervisor">Supervisor</option>
                <option value="owner">Owner</option>
              </select>
            </Field>
            <Field label="Hire Date"><input type="date" className={inputCls} value={form.hire_date || ""} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></Field>
            {(form.role === "owner" || form.role === "supervisor") && (
              <Field label={editing === "new" ? "Login Password" : "New Password (blank = keep)"}><input data-testid="emp-form-password" type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
            )}
            <Field label="Email"><input className={inputCls} value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <div className="flex items-center gap-3 pt-6">
              <button onClick={() => setForm({ ...form, active: !form.active })} className={`w-11 h-6 rounded-full transition-colors relative ${form.active ? "bg-emerald-500" : "bg-slate-600"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.active ? "left-5" : "left-0.5"}`} />
              </button>
              <span className="text-sm font-semibold">{form.active ? "Active" : "Inactive"}</span>
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <Btn variant="ghost" className="flex-1 justify-center" onClick={() => setEditing(null)}>Cancel</Btn>
            <Btn className="flex-1 justify-center" data-testid="emp-form-save" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Btn>
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Modal title="Delete Employee" onClose={() => setConfirmDel(null)}>
          <p className="text-slate-400 text-sm mb-6">Delete <b className="text-white">{confirmDel.full_name}</b>? This removes them from the roster. Attendance records remain.</p>
          <div className="flex gap-3">
            <Btn variant="ghost" className="flex-1 justify-center" onClick={() => setConfirmDel(null)}>Cancel</Btn>
            <Btn variant="danger" className="flex-1 justify-center" data-testid="confirm-delete-employee" onClick={del}>Delete</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

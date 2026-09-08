import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";
import { PageHeader, Card, Btn, Field, inputCls } from "@/components/shared";
import { toast } from "sonner";
import { Save } from "lucide-react";

const TIMEZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu"];
const PAY_PERIODS = ["weekly", "biweekly", "semimonthly", "monthly"];

export default function Settings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: async () => (await api.get("/settings")).data });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!form) return null;

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings", {
        store_name: form.store_name,
        store_address: form.store_address,
        timezone: form.timezone,
        late_grace_minutes: parseInt(form.late_grace_minutes || 0),
        pay_period: form.pay_period,
        supervisor_can_view_payroll: form.supervisor_can_view_payroll,
      });
      toast.success("Settings saved");
      qc.invalidateQueries({ queryKey: ["settings"] });
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Store Settings" subtitle="Configure store details, timezone and policies.">
        <Btn data-testid="settings-save" disabled={busy} onClick={save}><Save className="w-4 h-4" /> {busy ? "Saving…" : "Save Changes"}</Btn>
      </PageHeader>

      <Card className="p-6 mb-5">
        <h3 className="font-bold mb-4">Store Details</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Store Name"><input data-testid="set-store-name" className={inputCls} value={form.store_name} onChange={(e) => setForm({ ...form, store_name: e.target.value })} /></Field>
          <Field label="Store Address"><input className={inputCls} value={form.store_address || ""} onChange={(e) => setForm({ ...form, store_address: e.target.value })} /></Field>
          <Field label="Timezone">
            <select data-testid="set-timezone" className={inputCls} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              {TIMEZONES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Pay Period">
            <select className={inputCls} value={form.pay_period} onChange={(e) => setForm({ ...form, pay_period: e.target.value })}>
              {PAY_PERIODS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <Card className="p-6 mb-5">
        <h3 className="font-bold mb-4">Attendance Policies</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Late Grace Period (minutes)"><input data-testid="set-grace" type="number" className={inputCls} value={form.late_grace_minutes} onChange={(e) => setForm({ ...form, late_grace_minutes: e.target.value })} /></Field>
        </div>
        <div className="mt-4 rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 py-3 text-sm text-slate-400">
          Overtime is <b className="text-white">disabled</b> by design — all worked hours count normally regardless of daily/weekly totals.
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-bold mb-4">Permissions</h3>
        <div className="flex items-center justify-between py-2">
          <div>
            <div className="font-semibold text-sm">Supervisors can view Payroll</div>
            <div className="text-xs text-slate-500">Supervisors can never edit attendance records — owner only.</div>
          </div>
          <button data-testid="set-sup-payroll" onClick={() => setForm({ ...form, supervisor_can_view_payroll: !form.supervisor_can_view_payroll })}
            className={`w-11 h-6 rounded-full transition-colors relative ${form.supervisor_can_view_payroll ? "bg-emerald-500" : "bg-slate-600"}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.supervisor_can_view_payroll ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
      </Card>
    </div>
  );
}

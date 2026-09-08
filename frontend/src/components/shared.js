export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-4 mb-6 animate-fade-up">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-2xl bg-[#181A24] border border-[#282C3D] ${className}`}>{children}</div>;
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-10 h-10 text-slate-600 mb-3" />}
      <p className="text-slate-400 font-semibold">{title}</p>
      {hint && <p className="text-slate-600 text-sm mt-1">{hint}</p>}
    </div>
  );
}

const STATUS = {
  clocked_in: "text-emerald-400 border-emerald-500/40 bg-emerald-950/50",
  on_break: "text-amber-400 border-amber-500/40 bg-amber-950/50",
  clocked_out: "text-slate-400 border-slate-600/40 bg-slate-800/40",
};
const LABELS = { clocked_in: "Clocked In", on_break: "On Break", clocked_out: "Clocked Out" };

export function StatusBadge({ status, late }) {
  return (
    <div className="flex items-center gap-1.5">
      <span data-testid="status-badge" className={`inline-block px-2.5 py-1 rounded-full border text-xs font-bold ${STATUS[status] || STATUS.clocked_out}`}>
        {LABELS[status] || "Clocked Out"}
      </span>
      {late && <span className="inline-block px-2.5 py-1 rounded-full border border-rose-500/40 bg-rose-950/50 text-rose-400 text-xs font-bold">Late</span>}
    </div>
  );
}

export function Btn({ children, variant = "primary", className = "", ...props }) {
  const styles = {
    primary: "bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 hover:from-amber-300 hover:to-amber-500",
    ghost: "bg-[#1F2230] border border-[#2f3446] text-slate-200 hover:bg-[#262a3a]",
    danger: "bg-rose-600/90 text-white hover:bg-rose-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
  };
  return (
    <button {...props} className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2 ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-400 mb-1.5 block uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

export const inputCls = "w-full h-11 rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 text-sm text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none transition-colors";

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[88vh] overflow-y-auto rounded-3xl bg-[#181A24] border border-[#282C3D] p-6 shadow-2xl animate-fade-up`} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-extrabold mb-5">{title}</h3>
        {children}
      </div>
    </div>
  );
}

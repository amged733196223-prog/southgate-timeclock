import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { ShieldCheck, ArrowLeft, Lock } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (res.ok) { toast.success("Welcome back"); navigate("/admin"); }
    else toast.error(res.error);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-5 bg-[#090A0F] overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-amber-500/10 blur-[130px]" />
      <button onClick={() => navigate("/")} className="absolute top-6 left-6 flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-amber-400 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Kiosk
      </button>
      <div className="relative z-10 w-full max-w-md animate-fade-up">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-lg mb-4">
            <ShieldCheck className="w-7 h-7 text-slate-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Manager Login</h1>
          <p className="text-sm text-slate-500 mt-1">Southgate Smoke Shop · Owner & Supervisor</p>
        </div>
        <form onSubmit={submit} className="rounded-3xl bg-[#181A24] border border-[#282C3D] p-7 shadow-2xl space-y-5">
          <div>
            <label className="text-sm font-semibold text-slate-300 mb-2 block">Username</label>
            <input data-testid="login-username-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="owner"
              className="w-full h-13 py-3 rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none transition-colors" />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-300 mb-2 block">Password</label>
            <input data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              className="w-full h-13 py-3 rounded-xl bg-[#0F1118] border border-[#282C3D] px-4 text-white placeholder:text-slate-600 focus:border-amber-500 focus:outline-none transition-colors" />
          </div>
          <button data-testid="login-submit-btn" disabled={busy} type="submit"
            className="w-full h-13 py-3.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-600 text-slate-950 font-black uppercase tracking-wide flex items-center justify-center gap-2 hover:from-amber-300 hover:to-amber-500 active:scale-[0.98] transition-all disabled:opacity-60">
            <Lock className="w-4 h-4" /> {busy ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}

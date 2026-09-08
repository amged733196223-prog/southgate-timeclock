// Shared helpers for formatting times in the store timezone
import { useEffect, useState } from "react";

let STORE_TZ = "America/New_York";
export function setStoreTz(tz) { if (tz) STORE_TZ = tz; }
export function getStoreTz() { return STORE_TZ; }

export function fmtTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: STORE_TZ });
  } catch { return "—"; }
}

export function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: STORE_TZ });
  } catch { return "—"; }
}

export function fmtDate(d) {
  if (!d) return "—";
  try {
    const dt = d.length === 10 ? new Date(d + "T12:00:00") : new Date(d);
    return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: STORE_TZ });
  } catch { return d; }
}

export function fmtHours(h) {
  const n = Number(h || 0);
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return `${hh}h ${mm}m`;
}

// Live clock hook
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

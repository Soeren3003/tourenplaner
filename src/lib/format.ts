export function money(n: number, currency = "EUR") {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(Number.isFinite(n) ? n : 0);
}

export function num(n: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n || 0);
}

export function fixed(n: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n || 0);
}

/** „22,99“ oder „22.99“ → 22.99; ungültig → null. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(/€/g, "");
  if (!t) return 0;
  const normalized = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Minuten → „1:35“ */
export function duration(minutes: number) {
  const m = Math.round(minutes || 0);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** „1:35“, „1h 35m“, „95m“, „1,5“ (Stunden) → Minuten; ungültig → null. */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase();
  if (!t) return 0;
  let m = t.match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(?:(\d+(?:[.,]\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (m && (m[1] || m[2])) return Math.round(Number((m[1] ?? "0").replace(",", ".")) * 60) + Number(m[2] ?? 0);
  const n = parseNum(t);
  return n === null ? null : Math.round(n * 60);
}

export function date(iso: string) {
  if (!iso) return "–";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("de-DE");
}

export function dateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${num(n / 1024, 0)} KB`;
  return `${num(n / 1024 / 1024, 1)} MB`;
}

export function safeFileName(s: string) {
  return s.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}

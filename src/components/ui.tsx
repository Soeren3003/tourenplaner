import { useEffect, useState, type ReactNode } from "react";
import { duration, fixed, parseDuration, parseNum } from "../lib/format";

/** Zahlenfeld mit deutschem Komma; übernimmt den Wert sofort, formatiert beim Verlassen. */
export function NumberInput({
  value,
  onChange,
  digits = 2,
  suffix,
  placeholder,
  className = "",
  min,
  allowEmpty,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  digits?: number;
  suffix?: string;
  placeholder?: string;
  className?: string;
  min?: number;
  allowEmpty?: boolean;
}) {
  const show = (v: number | null) => (v === null ? "" : digits === 0 ? String(v) : fixed(v, digits));
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focus]);
  const n = parseNum(text);
  const invalid = n === null || (min !== undefined && n < min);
  return (
    <span className={`input-wrap ${className}`}>
      <input
        className={`num ${invalid ? "invalid" : ""}`}
        value={text}
        placeholder={placeholder}
        inputMode="decimal"
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          setText(e.target.value);
          if (allowEmpty && e.target.value.trim() === "") return onChange(null);
          const v = parseNum(e.target.value);
          if (v !== null && (min === undefined || v >= min)) onChange(v);
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function DurationInput({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(minutes ? duration(minutes) : "");
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(minutes ? duration(minutes) : "");
  }, [minutes, focus]);
  const invalid = parseDuration(text) === null;
  return (
    <span className="input-wrap">
      <input
        className={`num ${invalid ? "invalid" : ""}`}
        value={text}
        placeholder="h:mm"
        title="z. B. 1:35, 1h 35m, 95m oder 1,5 (Stunden)"
        onFocus={(e) => {
          setFocus(true);
          e.target.select();
        }}
        onBlur={() => setFocus(false)}
        onChange={(e) => {
          setText(e.target.value);
          const m = parseDuration(e.target.value);
          if (m !== null) onChange(m);
        }}
      />
      <span className="suffix">h</span>
    </span>
  );
}

export function Field({ label, children, wide, hint }: { label: string; children: ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Schließen">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  );
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return <span className={`badge badge-${color}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

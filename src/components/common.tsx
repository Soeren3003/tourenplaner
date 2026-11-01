import type { Member } from "../lib/types";

export function MemberDot({ member, size = 22 }: { member?: Member; size?: number }) {
  const initials = (member?.name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span className="member-dot" style={{ background: member?.color ?? "#9aa1ad", width: size, height: size, fontSize: size * 0.42 }} title={member?.name}>
      {initials}
    </span>
  );
}

/** Mitfahrer an-/abwählen; leere Auswahl = alle */
export function MemberPicker({
  members,
  selected,
  onChange,
  allLabel,
}: {
  members: Member[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allLabel?: string;
}) {
  const all = selected.length === 0;
  return (
    <div className="member-picker">
      {allLabel && (
        <button type="button" className={`chip-btn ${all ? "on" : ""}`} onClick={() => onChange([])}>
          {allLabel}
        </button>
      )}
      {members.map((m) => {
        const on = all ? !allLabel : selected.includes(m.id);
        return (
          <button
            type="button"
            key={m.id}
            className={`chip-btn ${on && !all ? "on" : ""} ${all && allLabel ? "implied" : ""}`}
            onClick={() => {
              const base = all ? [] : selected;
              const next = base.includes(m.id) ? base.filter((x) => x !== m.id) : [...base, m.id];
              onChange(next);
            }}
          >
            <MemberDot member={m} size={16} /> {m.name || "Ohne Namen"}
          </button>
        );
      })}
    </div>
  );
}

export function MemberSelect({
  members,
  value,
  onChange,
  emptyLabel,
}: {
  members: Member[];
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {members.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name || "Ohne Namen"}
        </option>
      ))}
    </select>
  );
}

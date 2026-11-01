import { useState } from "react";
import { MemberDot } from "../../components/common";
import { uid } from "../../lib/defaults";
import { useStore } from "../../lib/store";
import type { ChecklistItem, Tour } from "../../lib/types";

export default function Checklist({ tour }: { tour: Tour }) {
  const store = useStore();
  const [text, setText] = useState("");
  const [hideDone, setHideDone] = useState(false);
  const members = store.members.filter((m) => tour.memberIds.includes(m.id));
  const setList = (checklist: ChecklistItem[]) => store.save("tours", { ...tour, checklist });
  const upd = (id: string, patch: Partial<ChecklistItem>) => setList(tour.checklist.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const done = tour.checklist.filter((c) => c.done).length;

  const add = () => {
    if (!text.trim()) return;
    setList([...tour.checklist, { id: uid(), text: text.trim(), done: false, assignee: "" }]);
    setText("");
  };

  const shown = tour.checklist.filter((c) => !hideDone || !c.done);

  return (
    <section className="card narrow">
      <div className="card-head">
        <h2>
          Checkliste <span className="muted small">{done} / {tour.checklist.length} erledigt</span>
        </h2>
        <div className="row">
          <label className="check small">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
            Erledigte ausblenden
          </label>
          <button
            className="ghost small"
            title="Fehlende Punkte aus der Vorlage (Einstellungen) ergänzen"
            onClick={() => {
              const have = new Set(tour.checklist.map((c) => c.text));
              setList([...tour.checklist, ...store.settings.checklistTemplate.filter((t) => !have.has(t)).map((t) => ({ id: uid(), text: t, done: false, assignee: "" }))]);
            }}
          >
            Vorlage ergänzen
          </button>
        </div>
      </div>
      {tour.checklist.length > 0 && (
        <div className="progress">
          <div style={{ width: `${(done / tour.checklist.length) * 100}%` }} />
        </div>
      )}
      <ul className="checklist">
        {shown.map((c) => (
          <li key={c.id} className={c.done ? "done" : ""}>
            <input type="checkbox" checked={c.done} onChange={(e) => upd(c.id, { done: e.target.checked })} />
            <input className="grow plain-input" value={c.text} onChange={(e) => upd(c.id, { text: e.target.value })} />
            {c.assignee && <MemberDot member={store.members.find((m) => m.id === c.assignee)} size={18} />}
            <select className="small" value={c.assignee} onChange={(e) => upd(c.id, { assignee: e.target.value })} title="Wer kümmert sich?">
              <option value="">Alle / jeder</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <button className="icon danger" onClick={() => setList(tour.checklist.filter((x) => x.id !== c.id))} title="Entfernen">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <input className="grow" value={text} placeholder="Neuer Punkt, z. B. „Brenner-Vignette kaufen“" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!text.trim()}>
          Hinzufügen
        </button>
      </div>
    </section>
  );
}

import { useState } from "react";
import { MemberDot } from "../components/common";
import { DurationInput, Empty, Field, NumberInput } from "../components/ui";
import { confirmDialog } from "../lib/api";
import { DRIVE_DEFAULTS, newMember, PALETTE } from "../lib/defaults";
import { num } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";
import type { Drive, Member } from "../lib/types";

export default function Members({ selected }: { selected?: string }) {
  const store = useStore();
  const [sel, setSel] = useState(selected ?? store.members[0]?.id ?? "");
  const m = store.members.find((x) => x.id === sel);

  const add = () => {
    const x = newMember(store.members.length);
    store.save("members", x);
    setSel(x.id);
  };

  return (
    <div className="page">
      <div className="page-head">
        <h1>Mitfahrer</h1>
        <button className="primary" onClick={add}>
          + Mitfahrer
        </button>
      </div>
      {store.members.length === 0 ? (
        <Empty>
          Noch keine Mitfahrer. Lege dich und deine Gruppe an – Motorrad, Tankreichweite und Verbrauch fließen in die Tankstopp- und Spritkostenplanung ein.
        </Empty>
      ) : (
        <div className="master-detail">
          <ul className="pick-list master">
            {store.members.map((x) => (
              <li key={x.id} className={x.id === sel ? "active" : ""} onClick={() => setSel(x.id)}>
                <MemberDot member={x} />
                <div>
                  <div>
                    {x.name || "Ohne Namen"} {store.me === x.id && <span className="muted small">(ich)</span>}
                  </div>
                  <div className="muted small">
                    {x.drive === "electric" && <span title="Elektromotorrad">⚡ </span>}
                    {x.bike || "–"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {m ? <MemberEditor key={m.id} m={m} onDeleted={() => setSel("")} /> : <Empty>Mitfahrer links auswählen.</Empty>}
        </div>
      )}
    </div>
  );
}

function MemberEditor({ m, onDeleted }: { m: Member; onDeleted: () => void }) {
  const store = useStore();
  const set = (patch: Partial<Member>) => store.save("members", { ...m, ...patch });
  const electric = m.drive === "electric";
  const tours = store.tours.filter((t) => t.memberIds.includes(m.id));
  const ridden = tours.reduce((a, t) => a + summarize(t, store).memberKm(m.id), 0);

  const remove = async () => {
    const used = tours.length;
    const msg = used ? `${m.name} ist in ${used} Tour(en) eingetragen und wird dort entfernt. Trotzdem löschen?` : `${m.name || "Mitfahrer"} löschen?`;
    if (!(await confirmDialog(msg))) return;
    for (const t of tours) store.save("tours", { ...t, memberIds: t.memberIds.filter((id) => id !== m.id) });
    await store.remove("members", m.id);
    onDeleted();
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>{m.name || "Neuer Mitfahrer"}</h2>
        <div className="row">
          {store.me === m.id ? (
            <span className="badge badge-green">Das bin ich</span>
          ) : (
            <button className="ghost small" onClick={() => store.setMe(m.id)} title="Wird nur auf diesem Rechner gespeichert und als „bezahlt von“ vorausgewählt.">
              Das bin ich
            </button>
          )}
          <button className="ghost small danger" onClick={remove}>
            Löschen
          </button>
        </div>
      </div>
      <div className="form-grid">
        <Field label="Name">
          <input value={m.name} autoFocus={!m.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Motorrad">
          <input value={m.bike} placeholder="z. B. BMW R 1250 GS" onChange={(e) => set({ bike: e.target.value })} />
        </Field>
        <Field label="Antrieb">
          <div className="segmented">
            {(
              [
                ["fuel", "⛽ Verbrenner"],
                ["electric", "⚡ Elektro"],
              ] as [Drive, string][]
            ).map(([d, label]) => (
              <button
                key={d}
                className={m.drive === d ? "active" : ""}
                onClick={() => {
                  if (m.drive === d) return;
                  // Werte des anderen Antriebs passen nicht (l ↔ kWh) – typische Werte vorschlagen
                  set({ drive: d, ...DRIVE_DEFAULTS[d] });
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Field>
        <Field
          label={electric ? "Reichweite je Akkuladung" : "Reichweite je Tankfüllung"}
          hint={`Die kleinste Reichweite der Gruppe bestimmt die ${electric ? "Ladestopps" : "Tankstopps"}.`}
        >
          <NumberInput value={m.tankRangeKm} digits={0} suffix="km" onChange={(v) => set({ tankRangeKm: v ?? 0 })} />
        </Field>
        <Field label="Verbrauch" hint={electric ? "Landstraße realistisch: 7–12 kWh/100 km" : undefined}>
          <NumberInput value={m.consumption} digits={1} suffix={electric ? "kWh/100 km" : "l/100 km"} onChange={(v) => set({ consumption: v ?? 0 })} />
        </Field>
        {electric && (
          <Field label="Dauer eines Ladestopps" hint="Schnellladen bis ca. 80 %; wird zur Ankunftszeit addiert.">
            <DurationInput minutes={m.chargeMinutes} onChange={(v) => set({ chargeMinutes: v })} />
          </Field>
        )}
        <Field label="Telefon">
          <input value={m.phone} onChange={(e) => set({ phone: e.target.value })} />
        </Field>
        <Field label="Notfallkontakt">
          <input value={m.emergencyContact} placeholder="Name, Telefon" onChange={(e) => set({ emergencyContact: e.target.value })} />
        </Field>
        <Field label="Farbe">
          <div className="color-row">
            {PALETTE.map((c) => (
              <button key={c} className={`swatch ${m.color === c ? "on" : ""}`} style={{ background: c }} onClick={() => set({ color: c })} aria-label={c} />
            ))}
          </div>
        </Field>
        <Field label="Notizen" wide>
          <textarea rows={3} value={m.notes} placeholder="Blutgruppe, Allergien, Kleidergröße …" onChange={(e) => set({ notes: e.target.value })} />
        </Field>
      </div>
      <div className="stats">
        <div className="stat">
          <div className="stat-label">Touren</div>
          <div className="stat-value">{tours.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Gefahrene km (erfasst)</div>
          <div className="stat-value">{num(ridden, 0)}</div>
        </div>
      </div>
    </section>
  );
}

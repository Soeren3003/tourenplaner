import { useMemo, useState } from "react";
import type { TourTab } from "../../App";
import { MemberPicker } from "../../components/common";
import MapView, { type MapLine, type MapMarker } from "../../components/MapView";
import { Field, NumberInput } from "../../components/ui";
import { Weather } from "../../components/Weather";
import { arrival } from "../../lib/calc";
import { CURRENCIES, PALETTE, addDays, daysBetween } from "../../lib/defaults";
import { dayNo, exportGpx, exportRoadbook } from "../../lib/export";
import { date, duration, money, num } from "../../lib/format";
import { decodePolyline } from "../../lib/geo";
import { useStore } from "../../lib/store";
import type { TourSummary } from "../../lib/summary";
import type { Stage, Tour } from "../../lib/types";

export const stageColor = (tour: Tour, s: Stage) => PALETTE[(dayNo(tour, s) - 1 + PALETTE.length) % PALETTE.length];

export function stageEnd(s: Stage) {
  return s.waypoints[s.waypoints.length - 1];
}

export function tourMapLayers(tour: Tour, sum: TourSummary, onStage?: (id: string) => void) {
  const lines: MapLine[] = sum.stages.map((s) => ({
    id: s.id,
    points: s.geometry ? decodePolyline(s.geometry) : s.waypoints,
    color: stageColor(tour, s),
    dashed: !s.geometry,
    tooltip: `Tag ${dayNo(tour, s)}${s.title ? `: ${s.title}` : ""} · ${num(s.distanceKm, 0)} km`,
    onClick: onStage ? () => onStage(s.id) : undefined,
  }));
  const markers: MapMarker[] = sum.hotels
    .filter((h) => h.lat !== null && h.lon !== null && h.status !== "cancelled")
    .map((h) => ({ id: h.id, pos: { lat: h.lat!, lon: h.lon! }, label: "🛏", color: "#1f2937", shape: "square", title: `${h.name} (${date(h.checkIn)})` }));
  const first = sum.stages.find((s) => s.waypoints.length);
  if (first) markers.unshift({ id: "start", pos: first.waypoints[0], label: "▶", color: "#1f8a4c", title: `Start: ${first.waypoints[0].name}` });
  return { lines, markers };
}

export default function Overview({ tour, sum, go }: { tour: Tour; sum: TourSummary; go: (t: TourTab, stageId?: string) => void }) {
  const store = useStore();
  const [busy, setBusy] = useState("");
  const set = (patch: Partial<Tour>) => store.save("tours", { ...tour, ...patch });
  const { lines, markers } = useMemo(() => tourMapLayers(tour, sum, (id) => go("stages", id)), [tour, sum]); // eslint-disable-line react-hooks/exhaustive-deps
  const days = daysBetween(tour.startDate, tour.endDate) + 1;
  const cur = tour.currency;
  const hotelOn = (d: string) => sum.hotels.find((h) => h.checkIn === d && h.status !== "cancelled");

  const run = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="split">
      <div className="main-col">
        <section className="card flush">
          <MapView lines={lines} markers={markers} fitKey={`${tour.id}-${sum.stages.length}`} className="tall" />
        </section>
        <section className="card">
          <div className="card-head">
            <h2>Tagesplan</h2>
            <div className="row">
              <button className="ghost small" disabled={!sum.stages.length || !!busy} onClick={() => run("gpx", () => exportGpx(tour, sum.stages))}>
                GPX der ganzen Tour
              </button>
              <button className="ghost small" disabled={!!busy} onClick={() => run("pdf", () => exportRoadbook(tour, sum))}>
                Roadbook (PDF)
              </button>
            </div>
          </div>
          <table className="list">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Etappe</th>
                <th className="r">km</th>
                <th className="r">Fahrzeit</th>
                <th>Ankunft</th>
                <th>Übernachtung</th>
                <th>Wetter</th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: Math.max(0, Math.min(days, 60)) }, (_, i) => addDays(tour.startDate, i)).map((d) => {
                const stages = sum.stages.filter((s) => s.date === d);
                const hotel = hotelOn(d);
                if (!stages.length)
                  return (
                    <tr key={d} className="static">
                      <td className="nowrap">
                        <span className="day-dot" style={{ background: "var(--viz-base)" }} />
                        {date(d)}
                      </td>
                      <td className="muted" colSpan={4}>
                        {d === tour.endDate ? "Abreise" : "Ruhetag / noch nicht geplant"}
                      </td>
                      <td>{hotel?.name ?? ""}</td>
                      <td />
                    </tr>
                  );
                return stages.map((s, j) => (
                  <tr key={s.id} onClick={() => go("stages", s.id)}>
                    <td className="nowrap">
                      <span className="day-dot" style={{ background: stageColor(tour, s) }} />
                      {j === 0 ? date(d) : ""}
                    </td>
                    <td>
                      {s.title || s.waypoints.map((w) => w.name.split(",")[0]).filter(Boolean).join(" → ") || <span className="muted">Ohne Route</span>}
                      {s.ridden && <span className="badge badge-purple small-badge">gefahren</span>}
                    </td>
                    <td className="r">{num(s.actualKm ?? s.distanceKm, 0)}</td>
                    <td className="r">{duration(s.actualMin ?? s.durationMin)}</td>
                    <td className="nowrap">{s.durationMin ? arrival(s) : "–"}</td>
                    <td>{j === stages.length - 1 ? (hotel?.name ?? "") : ""}</td>
                    <td>
                      <Weather pos={stageEnd(s)} date={s.date} />
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
          <div className="row">
            <button className="link small" onClick={() => go("stages")}>
              → Etappen planen
            </button>
          </div>
        </section>
      </div>

      <aside className="side-col">
        <section className="card">
          <h2>Eckdaten</h2>
          <div className="form-grid one">
            <Field label="Region / Ziel">
              <input value={tour.region} placeholder="z. B. Dolomiten, Alpen, Schottland" onChange={(e) => set({ region: e.target.value })} />
            </Field>
            <div className="row two">
              <Field label="Von">
                <input
                  type="date"
                  value={tour.startDate}
                  onChange={(e) => {
                    const start = e.target.value;
                    if (!start) return;
                    const len = daysBetween(tour.startDate, tour.endDate);
                    set({ startDate: start, endDate: addDays(start, Math.max(0, len)) });
                  }}
                />
              </Field>
              <Field label="Bis">
                <input type="date" value={tour.endDate} min={tour.startDate} onChange={(e) => e.target.value && set({ endDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Mitfahrer">
              {store.members.length ? (
                <MemberPicker members={store.members} selected={tour.memberIds} onChange={(memberIds) => set({ memberIds })} />
              ) : (
                <span className="muted small">Lege zuerst unter „Mitfahrer“ die Gruppe an.</span>
              )}
            </Field>
            <div className="row two">
              <Field label="Währung">
                <select value={tour.currency} onChange={(e) => set({ currency: e.target.value })}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label={`Spritpreis (${cur}/l)`}>
                <NumberInput value={tour.fuelPrice} digits={2} onChange={(v) => set({ fuelPrice: v ?? 0 })} />
              </Field>
            </div>
            <Field label="Notizen">
              <textarea rows={4} value={tour.notes} placeholder="Ideen, Highlights, Pässe, Treffpunkt …" onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
        </section>

        <section className="card">
          <h2>Zusammenfassung</h2>
          <dl className="kv-list">
            <dt>Tage / Etappen</dt>
            <dd>
              {days} / {sum.stats.stages}
            </dd>
            <dt>Strecke</dt>
            <dd>{num(sum.stats.km, 0)} km</dd>
            <dt>Fahrzeit</dt>
            <dd>{duration(sum.stats.minutes)} h</dd>
            <dt>Ø pro Fahrtag</dt>
            <dd>{num(sum.stats.avgKmPerDay, 0)} km</dd>
            <dt>Längster Tag</dt>
            <dd>{num(sum.stats.longestKm, 0)} km</dd>
            <dt>Übernachtungen</dt>
            <dd>{sum.nights}</dd>
            {sum.fuel && (
              <>
                <dt>Sprit (geschätzt)</dt>
                <dd>
                  {num(sum.fuel.liters, 0)} l ≈ {money(sum.fuel.cost, cur)}
                </dd>
              </>
            )}
            <dt className="sep">Kosten bisher</dt>
            <dd className="sep">{money(sum.costs, cur)}</dd>
            <dt>
              <strong>pro Person {sum.hasFuelExpenses ? "" : "(inkl. Spritschätzung)"}</strong>
            </dt>
            <dd>
              <strong>{money(sum.perPerson, cur)}</strong>
            </dd>
          </dl>
        </section>
      </aside>
    </div>
  );
}

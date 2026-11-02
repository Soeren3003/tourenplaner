import { useEffect, useMemo, useRef, useState } from "react";
import { MemberDot, MemberPicker } from "../../components/common";
import MapView, { type MapLine, type MapMarker } from "../../components/MapView";
import { DurationInput, Empty, Field, NumberInput } from "../../components/ui";
import { Weather } from "../../components/Weather";
import { api, confirmDialog, pickTextFile } from "../../lib/api";
import { arrival, energyInfo, normalizeRiders, type EnergyGroup } from "../../lib/calc";
import { addDays, newStage, uid } from "../../lib/defaults";
import { dayNo, exportGpx } from "../../lib/export";
import { date, duration, num } from "../../lib/format";
import { bestInsertIndex, decodePolyline, encodePolyline, parseGpx, pathLength, pointsAlong, simplify } from "../../lib/geo";
import { reverseGeocode, routeMotorcycle, searchPlaces, type Place } from "../../lib/services";
import { useStore } from "../../lib/store";
import type { TourSummary } from "../../lib/summary";
import type { LatLon, RouteOptions, Stage, Tour, Waypoint } from "../../lib/types";
import { stageColor, stageEnd } from "./Overview";

const HIGHWAY_LEVELS: [number, string][] = [
  [0, "meiden (kurvig)"],
  [0.1, "möglichst wenig"],
  [0.5, "normal"],
  [1, "bevorzugen (schnell)"],
];

export default function Stages({ tour, sum, stageId, select }: { tour: Tour; sum: TourSummary; stageId?: string; select: (id?: string) => void }) {
  const store = useStore();
  const stage = sum.stages.find((s) => s.id === stageId) ?? sum.stages[0];

  const add = (after?: Stage) => {
    const prev = after ?? sum.stages[sum.stages.length - 1];
    const d = prev ? (prev.date < tour.endDate ? addDays(prev.date, 1) : prev.date) : tour.startDate;
    const s = newStage(store.settings, tour.id, d, sum.stages.filter((x) => x.date === d).length);
    // Die neue Etappe beginnt dort, wo die vorige aufgehört hat (bzw. am Hotel des Vortags).
    const hotel = sum.hotels.find((h) => h.checkOut === d && h.lat !== null && h.status !== "cancelled");
    const start = hotel ? { lat: hotel.lat!, lon: hotel.lon!, name: hotel.name } : prev && stageEnd(prev);
    if (start) s.waypoints = [{ id: uid(), lat: start.lat, lon: start.lon, name: start.name }];
    store.save("stages", s);
    select(s.id);
  };

  return (
    <div className="stages-layout">
      <aside className="stage-list card">
        <div className="card-head">
          <h2>Etappen</h2>
          <button className="primary small" onClick={() => add()}>
            + Etappe
          </button>
        </div>
        {sum.stages.length === 0 ? (
          <p className="muted small">Noch keine Etappen. Lege die erste an und klicke dann Start, Ziel und Zwischenziele auf der Karte an.</p>
        ) : (
          <ul className="pick-list">
            {sum.stages.map((s) => (
              <li key={s.id} className={s.id === stage?.id ? "active" : ""} onClick={() => select(s.id)}>
                <span className="day-dot" style={{ background: stageColor(tour, s) }} />
                <div className="grow">
                  <div>
                    Tag {dayNo(tour, s)} <span className="muted small">· {date(s.date)}</span>
                  </div>
                  <div className="muted small ellipsis">{s.title || s.waypoints.map((w) => w.name.split(",")[0]).filter(Boolean).join(" → ") || "Ohne Route"}</div>
                  {s.memberIds?.length > 0 && (
                    <span className="dots" title={`Nur: ${sum.ridersOf(s).map((m) => m.name).join(", ")}`}>
                      {sum.ridersOf(s).map((m) => (
                        <MemberDot key={m.id} member={m} size={14} />
                      ))}
                    </span>
                  )}
                </div>
                <div className="r small">
                  <div>{num(s.actualKm ?? s.distanceKm, 0)} km</div>
                  <div className="muted">{duration(s.actualMin ?? s.durationMin)} h</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {sum.stages.length > 0 && (
          <div className="stage-total small">
            <span>Summe</span>
            <span>
              {num(sum.stats.km, 0)} km · {duration(sum.stats.minutes)} h
            </span>
          </div>
        )}
      </aside>
      {stage ? (
        <StageEditor key={stage.id} tour={tour} sum={sum} stage={stage} onNext={() => add(stage)} onDeleted={() => select(undefined)} />
      ) : (
        <Empty>Lege links eine Etappe an.</Empty>
      )}
    </div>
  );
}

function StageEditor({ tour, sum, stage, onNext, onDeleted }: { tour: Tour; sum: TourSummary; stage: Stage; onNext: () => void; onDeleted: () => void }) {
  const store = useStore();
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState("");
  const [fitKey, setFitKey] = useState(stage.id);

  // Immer mit dem neuesten Stand arbeiten – Ortsnamen und Routen kommen asynchron zurück.
  const latest = useRef(stage);
  latest.current = stage;
  const set = (patch: Partial<Stage>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    store.save("stages", next);
  };
  const setWaypoints = (waypoints: Waypoint[]) => set({ waypoints, source: "routing" });

  // ---------- Routing ----------
  const routeKey = JSON.stringify([stage.waypoints.map((w) => [w.lat, w.lon]), stage.options]);
  const lastRouted = useRef(stage.geometry ? routeKey : "");
  useEffect(() => {
    if (stage.source !== "routing") return;
    if (stage.waypoints.length < 2) {
      if (stage.geometry) set({ geometry: "", distanceKm: 0, durationMin: 0, legs: [] });
      lastRouted.current = routeKey;
      return;
    }
    if (routeKey === lastRouted.current) return;
    const t = window.setTimeout(async () => {
      setRouting(true);
      setRouteError("");
      try {
        const r = await routeMotorcycle(stage.waypoints, stage.options);
        if (JSON.stringify([latest.current.waypoints.map((w) => [w.lat, w.lon]), latest.current.options]) !== routeKey) return;
        lastRouted.current = routeKey;
        set({ geometry: r.geometry, distanceKm: Math.round(r.distanceKm * 10) / 10, durationMin: r.durationMin, legs: r.legs });
      } catch (e) {
        setRouteError(String(e));
      } finally {
        setRouting(false);
      }
    }, 600);
    return () => clearTimeout(t);
  }, [routeKey, stage.source]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Wegpunkte ----------
  const addPoint = async (p: LatLon, index: number, name = "") => {
    const w: Waypoint = { id: uid(), lat: p.lat, lon: p.lon, name };
    const list = latest.current.waypoints.slice();
    list.splice(index, 0, w);
    setWaypoints(list);
    if (!name) {
      const n = await reverseGeocode(p);
      if (n) set({ waypoints: latest.current.waypoints.map((x) => (x.id === w.id ? { ...x, name: n } : x)) });
    }
  };

  const onMapClick = (p: LatLon, shift: boolean) => {
    const wps = latest.current.waypoints;
    addPoint(p, shift ? wps.length : bestInsertIndex(wps, p));
  };

  const move = (i: number, d: number) => {
    const list = stage.waypoints.slice();
    const [w] = list.splice(i, 1);
    list.splice(i + d, 0, w);
    setWaypoints(list);
  };

  const removePoint = (id: string) => setWaypoints(latest.current.waypoints.filter((w) => w.id !== id));

  const renamePoint = (id: string, name: string) => set({ waypoints: stage.waypoints.map((w) => (w.id === id ? { ...w, name } : w)) });

  const reverse = () => setWaypoints(stage.waypoints.slice().reverse());

  // ---------- Tank- und Ladestopps ----------
  const riders = sum.ridersOf(stage);
  const energy = energyInfo(stage.distanceKm, riders, store.settings.tankReserve, {
    fuel: tour.fuelPrice,
    electricity: tour.electricityPrice ?? store.settings.defaultElectricityPrice,
  });
  const stops = useMemo(() => {
    const route = stage.geometry ? decodePolyline(stage.geometry) : [];
    // Die Routen-km stammen vom Router, die Linie ist vereinfacht – Positionen darauf skalieren.
    const scale = route.length > 1 && stage.distanceKm ? pathLength(route) / stage.distanceKm : 1;
    const along = (g: EnergyGroup | null) =>
      g && route.length > 1 ? pointsAlong(route, g.stopKm.map((k) => k * scale)).map((pos, i) => ({ km: g.stopKm[i], pos, drive: g.drive })) : [];
    return [...along(energy?.fuel ?? null), ...along(energy?.electric ?? null)].sort((a, b) => a.km - b.km);
  }, [stage.geometry, stage.distanceKm, energy?.fuel?.rangeKm, energy?.electric?.rangeKm]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- Karte ----------
  const { lines, markers } = useMemo(() => {
    const lines: MapLine[] = sum.stages
      .filter((s) => s.id !== stage.id && s.geometry)
      .map((s) => ({ id: s.id, points: decodePolyline(s.geometry), color: "#9aa1ad", weight: 3, tooltip: `Tag ${dayNo(tour, s)}` }));
    const route = stage.geometry ? decodePolyline(stage.geometry) : stage.waypoints;
    lines.push({ id: stage.id, points: route, color: stageColor(tour, stage), weight: 6, dashed: !stage.geometry });
    const markers: MapMarker[] = sum.hotels
      .filter((h) => h.lat !== null && h.status !== "cancelled")
      .map((h) => ({
        id: h.id,
        pos: { lat: h.lat!, lon: h.lon! },
        label: "🛏",
        color: "#1f2937",
        shape: "square" as const,
        title: `${h.name} – klicken zum Hinzufügen`,
        onClick: () => {
          const wps = latest.current.waypoints;
          addPoint({ lat: h.lat!, lon: h.lon! }, wps.length, h.name);
        },
      }));
    stage.waypoints.forEach((w, i) => {
      const last = i === stage.waypoints.length - 1 && i > 0;
      markers.push({
        id: w.id,
        pos: w,
        label: i === 0 ? "S" : last ? "Z" : String(i),
        color: i === 0 ? "#1f8a4c" : last ? "#d33a3a" : stageColor(tour, stage),
        title: `${w.name || "Wegpunkt"} (Rechtsklick entfernt)`,
        draggable: true,
        onDragEnd: async (p) => {
          setWaypoints(latest.current.waypoints.map((x) => (x.id === w.id ? { ...x, ...p } : x)));
          const n = await reverseGeocode(p);
          if (n) set({ waypoints: latest.current.waypoints.map((x) => (x.id === w.id ? { ...x, name: n } : x)) });
        },
        onContextMenu: () => removePoint(w.id),
      });
    });
    stops.forEach((st, i) =>
      markers.push({
        id: `stop-${i}`,
        pos: st.pos,
        label: st.drive === "electric" ? "⚡" : "⛽",
        color: st.drive === "electric" ? "#0f8fa8" : "#c99a06",
        title: `${st.drive === "electric" ? "Ladestopp" : "Tankstopp"} bei ca. km ${Math.round(st.km)} – klicken für Suche in der Nähe`,
        onClick: () => api.openUrl(nearbyUrl(st.pos, st.drive)),
      }),
    );
    return { lines, markers };
  }, [stage, sum.stages, sum.hotels, tour, stops]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- GPX ----------
  const importGpx = async () => {
    try {
      const text = await pickTextFile("GPX-Datei für diese Etappe", ["gpx"]);
      if (!text) return;
      const g = parseGpx(text);
      const track = simplify(g.track, 0.00002);
      const km = Math.round(pathLength(g.track) * 10) / 10;
      const wps = (g.waypoints.length >= 2 ? g.waypoints : [g.track[0], g.track[g.track.length - 1]]).slice(0, 50);
      set({
        source: "gpx",
        geometry: encodePolyline(track),
        distanceKm: km,
        // Ohne Zeitstempel: Landstraßen-Schnitt von 55 km/h annehmen
        durationMin: g.recordedMinutes ?? Math.round((km / 55) * 60),
        legs: [],
        waypoints: wps.map((w) => ({ id: uid(), lat: w.lat, lon: w.lon, name: "name" in w ? (w.name as string) : "" })),
        title: latest.current.title || g.name,
      });
      setFitKey(uid());
    } catch (e) {
      alert(String(e));
    }
  };

  const googleMapsUrl = () => {
    const w = stage.waypoints;
    const f = (p: LatLon) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`;
    const via = w.slice(1, -1).slice(0, 9).map(f).join("|");
    return `https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${f(w[0])}&destination=${f(w[w.length - 1])}${via ? `&waypoints=${encodeURIComponent(via)}` : ""}`;
  };

  const remove = async () => {
    if (!(await confirmDialog(`Etappe „Tag ${dayNo(tour, stage)}${stage.title ? ` – ${stage.title}` : ""}“ löschen?`))) return;
    await store.remove("stages", stage.id);
    onDeleted();
  };

  const tourDays = Array.from({ length: Math.max(1, Math.min(60, Math.round((Date.parse(tour.endDate) - Date.parse(tour.startDate)) / 86_400_000) + 1)) }, (_, i) => addDays(tour.startDate, i));
  const hotelTonight = sum.hotels.find((h) => h.checkIn === stage.date && h.lat !== null && h.status !== "cancelled");
  const tonight = sum.hotels.find((h) => h.checkIn === stage.date && h.status !== "cancelled");

  return (
    <div className="stage-editor">
      <section className="card flush">
        <MapView
          lines={lines}
          markers={markers}
          onMapClick={onMapClick}
          fitKey={fitKey}
          className="tall"
          hint="Klick: Wegpunkt einfügen · Umschalt+Klick: ans Ende · Ziehen: verschieben · Rechtsklick: entfernen"
        />
        <div className="route-bar">
          <span>
            <b>{num(stage.distanceKm, 0)}</b> km
          </span>
          <span>
            <b>{duration(stage.durationMin)}</b> h Fahrzeit
          </span>
          <span>
            Abfahrt {stage.departure} → Ankunft ca. <b>{stage.durationMin ? arrival(stage, energy?.chargeMinutes) : "–"}</b>
          </span>
          {energy?.fuel && energy.fuel.stops > 0 && (
            <span title={`Reichweite ${energy.fuel.limitedBy}: ${energy.fuel.rangeKm} km (mit Reserve)`}>⛽ {energy.fuel.stops}× tanken</span>
          )}
          {energy?.electric && energy.electric.stops > 0 && (
            <span title={`Reichweite ${energy.electric.limitedBy}: ${energy.electric.rangeKm} km (mit Reserve)`}>
              ⚡ {energy.electric.stops}× laden (+{duration(energy.chargeMinutes)} h)
            </span>
          )}
          {routing && <span className="muted">Route wird berechnet …</span>}
          {stage.source === "gpx" && <span className="badge badge-teal">aus GPX</span>}
          {routeError && <span className="error-text" title={routeError}>Routing fehlgeschlagen</span>}
        </div>
      </section>

      <div className="split">
        <div className="main-col">
          <section className="card">
            <div className="card-head">
              <h2>Wegpunkte</h2>
              <div className="row">
                {hotelTonight && (
                  <button className="ghost small" onClick={() => addPoint({ lat: hotelTonight.lat!, lon: hotelTonight.lon! }, stage.waypoints.length, hotelTonight.name)}>
                    🛏 Hotel als Ziel
                  </button>
                )}
                <button className="ghost small" disabled={stage.waypoints.length < 2} onClick={reverse}>
                  ⇅ Umkehren
                </button>
              </div>
            </div>
            <PlaceSearch onPick={(p) => addPoint(p, stage.waypoints.length, p.name)} />
            {stage.waypoints.length === 0 ? (
              <p className="muted small">Ort suchen oder auf die Karte klicken.</p>
            ) : (
              <ol className="waypoints">
                {stage.waypoints.map((w, i) => {
                  const leg = stage.legs[i];
                  return (
                    <li key={w.id}>
                      <div className="wp-row">
                        <span className={`wp-num ${i === 0 ? "start" : i === stage.waypoints.length - 1 ? "end" : ""}`}>{i === 0 ? "S" : i === stage.waypoints.length - 1 ? "Z" : i}</span>
                        <input value={w.name} placeholder="Name" onChange={(e) => renamePoint(w.id, e.target.value)} />
                        <button className="icon" disabled={i === 0} onClick={() => move(i, -1)} title="nach oben">
                          ↑
                        </button>
                        <button className="icon" disabled={i === stage.waypoints.length - 1} onClick={() => move(i, 1)} title="nach unten">
                          ↓
                        </button>
                        <button className="icon danger" onClick={() => removePoint(w.id)} title="entfernen">
                          ×
                        </button>
                      </div>
                      {leg && i < stage.waypoints.length - 1 && (
                        <div className="leg muted small">
                          ↓ {num(leg.distanceKm, 0)} km · {duration(leg.durationMin)} h
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            <div className="row">
              <button className="ghost small" onClick={importGpx}>
                GPX importieren …
              </button>
              <button className="ghost small" disabled={stage.waypoints.length < 2} onClick={() => exportGpx(tour, [stage], `${tour.name} Tag ${dayNo(tour, stage)}`)}>
                GPX exportieren
              </button>
              <button className="ghost small" disabled={stage.waypoints.length < 2} onClick={() => api.openUrl(googleMapsUrl())}>
                In Google Maps öffnen
              </button>
              {stage.source === "gpx" && (
                <button className="ghost small" onClick={() => set({ source: "routing" })} title="Verwirft den GPX-Verlauf und berechnet die Route über die Wegpunkte">
                  Neu berechnen
                </button>
              )}
            </div>
          </section>

          <section className="card">
            <h2>Gefahren</h2>
            <div className="form-grid">
              <label className="check">
                <input type="checkbox" checked={stage.ridden} onChange={(e) => set({ ridden: e.target.checked })} />
                Etappe ist gefahren
              </label>
              <Field label="Tatsächliche km" hint="leer = geplante Werte">
                <NumberInput value={stage.actualKm} allowEmpty digits={0} suffix="km" placeholder={num(stage.distanceKm, 0)} onChange={(v) => set({ actualKm: v })} />
              </Field>
              <Field label="Tatsächliche Fahrzeit">
                <DurationInput minutes={stage.actualMin ?? 0} onChange={(m) => set({ actualMin: m || null })} />
              </Field>
            </div>
          </section>
        </div>

        <aside className="side-col">
          <section className="card">
            <div className="card-head">
              <h2>Etappe</h2>
              <button className="ghost small danger" onClick={remove}>
                Löschen
              </button>
            </div>
            <div className="form-grid one">
              <Field label="Titel">
                <input value={stage.title} placeholder="z. B. Über Stilfser Joch nach Bormio" onChange={(e) => set({ title: e.target.value })} />
              </Field>
              {sum.members.length > 1 && (
                <Field label="Wer fährt mit?" hint="z. B. Anreise oder Rückreise nur für einen Teil der Gruppe. Bestimmt Tank-/Ladestopps, Verbrauch und die km je Person.">
                  <MemberPicker
                    members={sum.members}
                    selected={stage.memberIds ?? []}
                    allLabel="Alle"
                    onChange={(ids) => set({ memberIds: normalizeRiders(ids, tour.memberIds) })}
                  />
                </Field>
              )}
              <div className="row two">
                <Field label="Datum">
                  <select value={stage.date} onChange={(e) => set({ date: e.target.value })}>
                    {!tourDays.includes(stage.date) && <option value={stage.date}>{date(stage.date)}</option>}
                    {tourDays.map((d, i) => (
                      <option key={d} value={d}>
                        Tag {i + 1} · {date(d)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Abfahrt">
                  <input type="time" value={stage.departure} onChange={(e) => set({ departure: e.target.value })} />
                </Field>
              </div>
              <Field label="Pausen gesamt" hint="Mittag, Kaffee, Tanken, Fotostopps">
                <DurationInput minutes={stage.pauseMinutes} onChange={(m) => set({ pauseMinutes: m })} />
              </Field>
              <Field label="Autobahnen">
                <select value={stage.options.useHighways} onChange={(e) => set({ options: { ...stage.options, useHighways: Number(e.target.value) } })}>
                  {HIGHWAY_LEVELS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <RouteToggles options={stage.options} onChange={(options) => set({ options })} />
              <Field label="Notizen">
                <textarea rows={3} value={stage.notes} placeholder="Pässe, Sehenswürdigkeiten, Mittagspause bei …" onChange={(e) => set({ notes: e.target.value })} />
              </Field>
            </div>
          </section>

          <section className="card">
            <h2>Wetter am Ziel</h2>
            {stageEnd(stage) ? <Weather pos={stageEnd(stage)} date={stage.date} full /> : null}
            <p className="muted small">Vorhersage erscheint ab 16 Tage vor der Etappe (Open-Meteo).</p>
          </section>

          {energy && (
            <section className="card">
              <h2>{energy.electric ? (energy.fuel ? "Tanken & Laden" : "Laden") : "Tanken"}</h2>
              <dl className="kv-list">
                {energy.fuel && (
                  <>
                    <dt>⛽ Kleinste Reichweite</dt>
                    <dd>
                      {energy.fuel.rangeKm} km ({energy.fuel.limitedBy})
                    </dd>
                    <dt>Tankstopps</dt>
                    <dd>{energy.fuel.stops}</dd>
                    <dt>Sprit gesamt</dt>
                    <dd>{num(energy.fuel.amount, 1)} l</dd>
                  </>
                )}
                {energy.electric && (
                  <>
                    <dt className={energy.fuel ? "sep" : ""}>⚡ Kleinste Reichweite</dt>
                    <dd className={energy.fuel ? "sep" : ""}>
                      {energy.electric.rangeKm} km ({energy.electric.limitedBy})
                    </dd>
                    <dt>Ladestopps</dt>
                    <dd>{energy.electric.stops}</dd>
                    <dt>Zusätzliche Ladezeit</dt>
                    <dd>{duration(energy.chargeMinutes)} h</dd>
                    <dt>Strom gesamt</dt>
                    <dd>{num(energy.electric.amount, 1)} kWh</dd>
                  </>
                )}
              </dl>
              {stops.length > 0 && (
                <ul className="plain stop-list small">
                  {stops.map((st, i) => (
                    <li key={i} className="row between">
                      <span>
                        {st.drive === "electric" ? "⚡ Laden" : "⛽ Tanken"} bei ca. km {Math.round(st.km)}
                      </span>
                      <button className="link small" onClick={() => api.openUrl(nearbyUrl(st.pos, st.drive))}>
                        {st.drive === "electric" ? "Ladesäulen" : "Tankstellen"} suchen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {energy.electric && <p className="muted small">Geplant wird mit vollem Akku am Morgen (über Nacht im Hotel laden).</p>}
              {energy.electric && tonight && !tonight.charging && (
                <div className="alert small">🔌 Für „{tonight.name || "die Unterkunft"}“ ist keine Lademöglichkeit eingetragen – morgen früh evtl. nicht voll geladen.</div>
              )}
            </section>
          )}

          <button className="ghost wide-btn" onClick={onNext}>
            + Nächste Etappe ab hier
          </button>
        </aside>
      </div>
    </div>
  );
}

/** Suche nach Tankstellen bzw. Ladesäulen rund um einen Punkt (Google Maps) */
function nearbyUrl(p: LatLon, drive: "fuel" | "electric") {
  const what = drive === "electric" ? "Ladestation" : "Tankstelle";
  return `https://www.google.com/maps/search/${encodeURIComponent(what)}/@${p.lat.toFixed(5)},${p.lon.toFixed(5)},13z`;
}

function RouteToggles({ options, onChange }: { options: RouteOptions; onChange: (o: RouteOptions) => void }) {
  return (
    <div className="row">
      <label className="check">
        <input type="checkbox" checked={options.avoidTolls} onChange={(e) => onChange({ ...options, avoidTolls: e.target.checked })} />
        Maut meiden
      </label>
      <label className="check">
        <input type="checkbox" checked={options.avoidFerries} onChange={(e) => onChange({ ...options, avoidFerries: e.target.checked })} />
        Fähren meiden
      </label>
    </div>
  );
}

export function PlaceSearch({ onPick, placeholder = "Ort, Pass oder Adresse suchen …" }: { onPick: (p: Place) => void; placeholder?: string }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Place[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setErr("");
    try {
      setRes(await searchPlaces(q.trim()));
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="place-search">
      <div className="row">
        <input
          className="grow"
          value={q}
          placeholder={placeholder}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") search();
            if (e.key === "Escape") setRes(null);
          }}
        />
        <button disabled={busy || !q.trim()} onClick={search}>
          {busy ? "…" : "Suchen"}
        </button>
      </div>
      {err && <div className="error-text small">{err}</div>}
      {res && (
        <ul className="search-results">
          {res.length === 0 && <li className="muted">Nichts gefunden.</li>}
          {res.map((p, i) => (
            <li
              key={i}
              onClick={() => {
                onPick(p);
                setRes(null);
                setQ("");
              }}
            >
              <strong>{p.name}</strong>
              <div className="muted small">{p.label}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

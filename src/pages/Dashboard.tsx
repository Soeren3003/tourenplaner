import { useMemo } from "react";
import type { Nav } from "../App";
import { MemberDot } from "../components/common";
import MapView from "../components/MapView";
import { Badge, Empty } from "../components/ui";
import { TOUR_STATUS, addDays, daysBetween, today } from "../lib/defaults";
import { date, duration, money, num } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";
import { tourMapLayers } from "./tour/Overview";

export default function Dashboard({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const store = useStore();
  const t0 = today();
  const summaries = useMemo(() => store.tours.map((t) => ({ tour: t, sum: summarize(t, store) })), [store]);
  const next = summaries.filter((x) => x.tour.endDate >= t0).sort((a, b) => a.tour.startDate.localeCompare(b.tour.startDate))[0];
  const past = summaries.filter((x) => x.tour.endDate < t0).sort((a, b) => b.tour.startDate.localeCompare(a.tour.startDate));

  const ridden = past.reduce((a, x) => a + x.sum.stats.km, 0);
  const rideMin = past.reduce((a, x) => a + x.sum.stats.minutes, 0);
  const daysOnBike = past.reduce((a, x) => a + x.sum.stats.days, 0);

  if (!store.tours.length)
    return (
      <div className="page">
        <div className="page-head">
          <h1>Übersicht</h1>
        </div>
        <Empty>
          <p>
            <strong>Willkommen beim Tourenplaner!</strong>
          </p>
          <p>
            1. Unter <button className="link" onClick={() => nav({ page: "members" })}>Mitfahrer</button> die Gruppe mit Motorrädern anlegen.
            <br />
            2. Eine Tour anlegen, Etappen auf der Karte planen und Unterkünfte eintragen.
            <br />
            3. Unterwegs Ausgaben erfassen – am Ende zeigt die App, wer wem was schuldet.
            <br />
            4. Optional: Nextcloud-Sync einrichten, damit alle in der Gruppe dieselben Daten sehen.
          </p>
          <button className="primary" onClick={onNew}>
            + Erste Tour anlegen
          </button>
        </Empty>
      </div>
    );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Übersicht</h1>
      </div>

      {next && <NextTour {...next} nav={nav} />}

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Touren gefahren</div>
          <div className="stat-value">{past.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Kilometer gesamt</div>
          <div className="stat-value">{num(ridden, 0)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Fahrzeit gesamt</div>
          <div className="stat-value">{duration(rideMin)} h</div>
        </div>
        <div className="stat">
          <div className="stat-label">Tage auf dem Motorrad</div>
          <div className="stat-value">{daysOnBike}</div>
        </div>
      </div>

      {past.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Vergangene Touren</h2>
            <button className="link small" onClick={() => nav({ page: "stats" })}>
              → Statistik
            </button>
          </div>
          <table className="list">
            <thead>
              <tr>
                <th>Tour</th>
                <th>Zeitraum</th>
                <th className="r">km</th>
                <th className="r">Fahrzeit</th>
                <th className="r">Kosten p. P.</th>
                <th>Gruppe</th>
              </tr>
            </thead>
            <tbody>
              {past.slice(0, 8).map(({ tour, sum }) => (
                <tr key={tour.id} onClick={() => nav({ page: "tour", id: tour.id })}>
                  <td>
                    <strong>{tour.name}</strong> {tour.region && <span className="muted small">· {tour.region}</span>}
                  </td>
                  <td className="nowrap">
                    {date(tour.startDate)} – {date(tour.endDate)}
                  </td>
                  <td className="r">{num(sum.stats.km, 0)}</td>
                  <td className="r">{duration(sum.stats.minutes)}</td>
                  <td className="r">{money(sum.perPerson, tour.currency)}</td>
                  <td>
                    <span className="dots">
                      {sum.members.map((m) => (
                        <MemberDot key={m.id} member={m} size={18} />
                      ))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function NextTour({ tour, sum, nav }: { tour: ReturnType<typeof useStore>["tours"][number]; sum: ReturnType<typeof summarize>; nav: Nav }) {
  const t0 = today();
  const until = daysBetween(t0, tour.startDate);
  const running = until <= 0;
  const layers = useMemo(() => tourMapLayers(tour, sum), [tour, sum]);
  const done = tour.checklist.filter((c) => c.done).length;
  const nights = Math.max(0, daysBetween(tour.startDate, tour.endDate));
  const openNights = Array.from({ length: Math.min(nights, 60) }, (_, i) => addDays(tour.startDate, i)).filter(
    (d) => !sum.hotels.some((h) => h.status !== "cancelled" && h.checkIn <= d && d < h.checkOut),
  ).length;
  const notBooked = sum.hotels.filter((h) => h.status === "idea" || h.status === "requested").length;
  const st = TOUR_STATUS[tour.status];

  return (
    <section className="card next-tour">
      <div className="next-info">
        <div className="muted small">{running ? "Läuft gerade" : "Nächste Tour"}</div>
        <h2 className="next-title">
          <button className="link" onClick={() => nav({ page: "tour", id: tour.id })}>
            {tour.name}
          </button>{" "}
          <Badge color={st.color}>{st.label}</Badge>
        </h2>
        <div className="muted">
          {tour.region && <>{tour.region} · </>}
          {date(tour.startDate)} – {date(tour.endDate)}
        </div>
        <div className="countdown">{running ? `Tag ${-until + 1}` : until === 1 ? "morgen!" : `noch ${until} Tage`}</div>
        <dl className="kv-list">
          <dt>Strecke</dt>
          <dd>
            {num(sum.stats.km, 0)} km in {sum.stats.stages} Etappen
          </dd>
          <dt>Fahrzeit</dt>
          <dd>{duration(sum.stats.minutes)} h</dd>
          <dt>Kosten p. P. (Schätzung)</dt>
          <dd>{money(sum.perPerson, tour.currency)}</dd>
          <dt>Checkliste</dt>
          <dd>
            <button className="link" onClick={() => nav({ page: "tour", id: tour.id, tab: "checklist" })}>
              {done} / {tour.checklist.length} erledigt
            </button>
          </dd>
        </dl>
        {(openNights > 0 || notBooked > 0) && (
          <div className="alert">
            {openNights > 0 && <div>🛏 {openNights} Nacht/Nächte noch ohne Unterkunft</div>}
            {notBooked > 0 && <div>⏳ {notBooked} Unterkunft/Unterkünfte noch nicht gebucht</div>}
          </div>
        )}
        <div className="dots">
          {sum.members.map((m) => (
            <MemberDot key={m.id} member={m} />
          ))}
        </div>
      </div>
      <div className="next-map">
        <MapView lines={layers.lines} markers={layers.markers} fitKey={tour.id} className="fill" />
      </div>
    </section>
  );
}

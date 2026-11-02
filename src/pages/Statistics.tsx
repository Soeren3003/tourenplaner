import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { BarList, Legend, StackedColumns } from "../components/charts";
import { MemberDot } from "../components/common";
import { Empty } from "../components/ui";
import { balances, stageKm, stageMin } from "../lib/calc";
import { dayNo } from "../lib/export";
import { date, duration, money, num } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";

const SERIES_KM = [
  { name: "gefahren", color: "var(--viz-1)" },
  { name: "geplant", color: "var(--viz-2)" },
];

export default function Statistics({ nav }: { nav: Nav }) {
  const store = useStore();
  const all = useMemo(
    () => store.tours.map((t) => ({ tour: t, sum: summarize(t, store) })).sort((a, b) => a.tour.startDate.localeCompare(b.tour.startDate)),
    [store],
  );
  const [tourId, setTourId] = useState(all[all.length - 1]?.tour.id ?? "");
  const sel = all.find((x) => x.tour.id === tourId);

  if (!all.length) return <Empty>Noch keine Touren – Statistik erscheint, sobald Etappen geplant sind.</Empty>;

  // Kilometer je Jahr, aufgeteilt in gefahren / nur geplant
  const years = [...new Set(all.map((x) => x.tour.startDate.slice(0, 4)))].sort();
  const perYear = years.map((y) => {
    const ts = all.filter((x) => x.tour.startDate.startsWith(y));
    const stages = ts.flatMap((x) => x.sum.stages);
    const riddenKm = stages.filter((s) => s.ridden).reduce((a, s) => a + stageKm(s), 0);
    const plannedKm = stages.filter((s) => !s.ridden).reduce((a, s) => a + s.distanceKm, 0);
    return { label: y, long: `${y} · ${ts.length} Tour(en)`, values: [Math.round(riddenKm), Math.round(plannedKm)] };
  });

  // Mitfahrer: Touren, km und Anteil an Kosten
  const members = store.members.map((m) => {
    const ts = all.filter((x) => x.tour.memberIds.includes(m.id));
    const km = ts.reduce((a, x) => a + x.sum.memberKm(m.id), 0);
    const share = ts.reduce((a, x) => a + (balances(x.tour.memberIds, x.sum.items).find((b) => b.memberId === m.id)?.share ?? 0), 0);
    return { m, tours: ts.length, km: Math.round(km), share };
  });

  const cur = store.settings.defaultCurrency;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Statistik</h1>
      </div>

      <div className="dash-grid two">
        <section className="card">
          <div className="card-head">
            <h2>Kilometer pro Jahr</h2>
            <Legend series={SERIES_KM} />
          </div>
          <StackedColumns data={perYear} series={SERIES_KM} format={(n) => `${num(n, 0)} km`} formatAxis={(n) => num(n, 0)} />
        </section>
        <section className="card">
          <h2>Kilometer je Mitfahrer (gefahren)</h2>
          <BarList items={members.filter((x) => x.tours).sort((a, b) => b.km - a.km).map((x) => ({ label: x.m.name, value: x.km, hint: `${x.tours} Touren` }))} format={(n) => `${num(n, 0)} km`} />
        </section>
      </div>

      <section className="card">
        <h2>Alle Touren</h2>
        <table className="list">
          <thead>
            <tr>
              <th>Tour</th>
              <th>Beginn</th>
              <th className="r">Fahrtage</th>
              <th className="r">km</th>
              <th className="r">Fahrzeit</th>
              <th className="r">Ø km/Tag</th>
              <th className="r">Ø km/h</th>
              <th className="r">Längster Tag</th>
              <th className="r">Kosten p. P.</th>
              <th className="r">pro km</th>
            </tr>
          </thead>
          <tbody>
            {all
              .slice()
              .reverse()
              .map(({ tour, sum }) => (
                <tr key={tour.id} onClick={() => nav({ page: "tour", id: tour.id })}>
                  <td>
                    <strong>{tour.name}</strong>
                  </td>
                  <td>{date(tour.startDate)}</td>
                  <td className="r">{sum.stats.days}</td>
                  <td className="r">{num(sum.stats.km, 0)}</td>
                  <td className="r">{duration(sum.stats.minutes)}</td>
                  <td className="r">{num(sum.stats.avgKmPerDay, 0)}</td>
                  <td className="r">{sum.stats.avgSpeed || "–"}</td>
                  <td className="r">{num(sum.stats.longestKm, 0)}</td>
                  <td className="r">{money(sum.perPerson, tour.currency)}</td>
                  <td className="r">{sum.stats.km ? money(sum.perPerson / sum.stats.km, tour.currency) : "–"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Tagesetappen im Vergleich</h2>
          <select className="small" value={tourId} onChange={(e) => setTourId(e.target.value)}>
            {all.map((x) => (
              <option key={x.tour.id} value={x.tour.id}>
                {x.tour.name}
              </option>
            ))}
          </select>
        </div>
        {sel && sel.sum.stages.length ? (
          <div className="dash-grid two">
            <div>
              <div className="muted small">Kilometer</div>
              <BarList
                showShare={false}
                items={sel.sum.stages.map((s) => ({ label: `Tag ${dayNo(sel.tour, s)}${s.title ? ` · ${s.title}` : ""}`, value: Math.round(stageKm(s)) }))}
                format={(n) => `${num(n, 0)} km`}
              />
            </div>
            <div>
              <div className="muted small">Fahrzeit</div>
              <BarList
                showShare={false}
                color="var(--viz-2)"
                items={sel.sum.stages.map((s) => ({ label: `Tag ${dayNo(sel.tour, s)}${s.title ? ` · ${s.title}` : ""}`, value: stageMin(s) }))}
                format={(n) => `${duration(n)} h`}
              />
            </div>
          </div>
        ) : (
          <p className="muted">Keine Etappen.</p>
        )}
      </section>

      <section className="card">
        <h2>Mitfahrer</h2>
        <table className="list compact">
          <thead>
            <tr>
              <th>Name</th>
              <th>Motorrad</th>
              <th className="r">Touren</th>
              <th className="r">km gefahren</th>
              <th className="r">Kostenanteil gesamt</th>
            </tr>
          </thead>
          <tbody>
            {members.map(({ m, tours, km, share }) => (
              <tr key={m.id} onClick={() => nav({ page: "members", id: m.id })}>
                <td>
                  <MemberDot member={m} size={18} /> {m.name}
                </td>
                <td>{m.bike}</td>
                <td className="r">{tours}</td>
                <td className="r">{num(km, 0)}</td>
                <td className="r">{money(share, cur)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

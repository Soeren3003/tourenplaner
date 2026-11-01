import { useMemo, useState } from "react";
import type { Nav } from "../App";
import { MemberDot } from "../components/common";
import { Badge, Empty } from "../components/ui";
import { TOUR_STATUS, daysBetween } from "../lib/defaults";
import { date, duration, money, num } from "../lib/format";
import { useStore } from "../lib/store";
import { summarize } from "../lib/summary";
import type { TourStatus } from "../lib/types";

export default function Tours({ nav, onNew }: { nav: Nav; onNew: () => void }) {
  const store = useStore();
  const [filter, setFilter] = useState<TourStatus | "">("");
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      store.tours
        .filter((t) => !filter || t.status === filter)
        .filter((t) => !q || `${t.name} ${t.region}`.toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [store.tours, filter, q],
  );

  return (
    <div className="page">
      <div className="page-head">
        <h1>Touren</h1>
        <div className="toolbar">
          <input className="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value as TourStatus | "")}>
            <option value="">Alle Status</option>
            {Object.entries(TOUR_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="primary" onClick={onNew}>
            + Neue Tour
          </button>
        </div>
      </div>
      {list.length === 0 ? (
        <Empty>{store.tours.length ? "Keine Tour passt zum Filter." : "Noch keine Touren. Leg los mit „+ Neue Tour“."}</Empty>
      ) : (
        <div className="tour-grid">
          {list.map((t) => {
            const s = summarize(t, store);
            const st = TOUR_STATUS[t.status];
            return (
              <button key={t.id} className="tour-card" onClick={() => nav({ page: "tour", id: t.id })}>
                <div className="row between">
                  <strong>{t.name}</strong>
                  <Badge color={st.color}>{st.label}</Badge>
                </div>
                <div className="muted small">
                  {t.region && <>{t.region} · </>}
                  {date(t.startDate)} – {date(t.endDate)} ({daysBetween(t.startDate, t.endDate) + 1} Tage)
                </div>
                <div className="tour-card-stats">
                  <span>
                    <b>{num(s.stats.km, 0)}</b> km
                  </span>
                  <span>
                    <b>{duration(s.stats.minutes)}</b> h Fahrzeit
                  </span>
                  <span>
                    <b>{s.stats.stages}</b> Etappen
                  </span>
                  <span>
                    <b>{s.nights}</b> Nächte
                  </span>
                </div>
                <div className="row between">
                  <span className="dots">
                    {s.members.map((m) => (
                      <MemberDot key={m.id} member={m} />
                    ))}
                  </span>
                  <span className="muted small">≈ {money(s.perPerson, t.currency)} p. P.</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect } from "react";
import type { Nav, TourTab, View } from "../App";
import { Empty } from "../components/ui";
import { confirmDialog } from "../lib/api";
import { TOUR_STATUS } from "../lib/defaults";
import { useStore } from "../lib/store";
import { routeMotorcycle } from "../lib/services";
import { summarize } from "../lib/summary";
import type { Tour, TourStatus } from "../lib/types";
import Checklist from "./tour/Checklist";
import Costs from "./tour/Costs";
import Files from "./tour/Files";
import Hotels from "./tour/Hotels";
import Overview from "./tour/Overview";
import Stages from "./tour/Stages";

const TABS: [TourTab, string][] = [
  ["overview", "Überblick"],
  ["stages", "Etappen & Karte"],
  ["hotels", "Unterkünfte"],
  ["costs", "Kosten"],
  ["checklist", "Checkliste"],
  ["files", "Dokumente"],
];

export default function TourDetail({ view, nav }: { view: Extract<View, { page: "tour" }>; nav: Nav }) {
  const store = useStore();
  const tour = store.tours.find((t) => t.id === view.id);
  // Im Etappen-Editor rechnet der Editor selbst.
  useMissingRoutes(view.id, view.tab !== "stages");
  if (!tour) return <Empty>Tour nicht gefunden.</Empty>;
  const tab = view.tab ?? "overview";
  const go = (t: TourTab, stageId?: string) => nav({ page: "tour", id: tour.id, tab: t, stageId });
  const set = (patch: Partial<Tour>) => store.save("tours", { ...tour, ...patch });
  const sum = summarize(tour, store);
  const open = tour.checklist.filter((c) => !c.done).length;

  const remove = async () => {
    if (!(await confirmDialog(`Tour „${tour.name}“ mit allen Etappen, Unterkünften, Ausgaben und Dokumenten löschen?`))) return;
    await store.deleteTour(tour.id);
    nav({ page: "tours" });
  };

  return (
    <div className="page tour-page">
      <div className="page-head">
        <input className="title-input" value={tour.name} onChange={(e) => set({ name: e.target.value })} aria-label="Name der Tour" />
        <div className="toolbar">
          <select value={tour.status} onChange={(e) => set({ status: e.target.value as TourStatus })}>
            {Object.entries(TOUR_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <button className="ghost danger" onClick={remove}>
            Löschen
          </button>
        </div>
      </div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => go(id)}>
            {label}
            {id === "stages" && sum.stages.length > 0 && <span className="tab-count">{sum.stages.length}</span>}
            {id === "hotels" && sum.hotels.length > 0 && <span className="tab-count">{sum.hotels.length}</span>}
            {id === "checklist" && open > 0 && <span className="tab-count">{open}</span>}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview tour={tour} sum={sum} go={go} />}
      {tab === "stages" && <Stages tour={tour} sum={sum} stageId={view.stageId} select={(id) => go("stages", id)} />}
      {tab === "hotels" && <Hotels tour={tour} sum={sum} />}
      {tab === "costs" && <Costs tour={tour} sum={sum} />}
      {tab === "checklist" && <Checklist tour={tour} />}
      {tab === "files" && <Files tour={tour} />}
    </div>
  );
}

const pending = new Set<string>();

/** Berechnet Routen für Etappen, die Wegpunkte, aber noch keinen Verlauf haben (z. B. frisch synchronisiert). */
function useMissingRoutes(tourId: string, enabled: boolean) {
  const store = useStore();
  const missing = store.stages.filter((s) => s.tourId === tourId && s.source === "routing" && s.waypoints.length >= 2 && !s.geometry && !pending.has(s.id) && enabled);
  const key = missing.map((s) => s.id).join(",");
  useEffect(() => {
    for (const s of missing) {
      pending.add(s.id);
      routeMotorcycle(s.waypoints, s.options)
        .then((r) => {
          const cur = store.stages.find((x) => x.id === s.id);
          if (cur && !cur.geometry && JSON.stringify(cur.waypoints) === JSON.stringify(s.waypoints))
            store.save("stages", { ...cur, geometry: r.geometry, distanceKm: Math.round(r.distanceKm * 10) / 10, durationMin: r.durationMin, legs: r.legs });
        })
        .catch(() => {})
        .finally(() => pending.delete(s.id));
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

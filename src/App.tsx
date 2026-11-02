import { useState } from "react";
import { AboutDialog, APP_VERSION } from "./components/About";
import { inTauri } from "./lib/api";
import { useStore } from "./lib/store";
import { newTour } from "./lib/defaults";
import { dateTime } from "./lib/format";
import Dashboard from "./pages/Dashboard";
import Tours from "./pages/Tours";
import TourDetail from "./pages/TourDetail";
import Members from "./pages/Members";
import Statistics from "./pages/Statistics";
import SettingsPage from "./pages/Settings";

export type TourTab = "overview" | "stages" | "hotels" | "costs" | "checklist" | "files";

export type View =
  | { page: "dashboard" }
  | { page: "tours" }
  | { page: "tour"; id: string; tab?: TourTab; stageId?: string }
  | { page: "members"; id?: string }
  | { page: "stats" }
  | { page: "settings"; tab?: string };

export type Nav = (v: View) => void;

/** Browser-Vorschau: Startansicht per URL, z. B. ?tour=demo-tour&tab=stages&stage=s2 (für Screenshots) */
function initialView(): View {
  if (inTauri) return { page: "dashboard" };
  const p = new URLSearchParams(location.search);
  const tour = p.get("tour");
  if (tour) return { page: "tour", id: tour, tab: (p.get("tab") as TourTab) || undefined, stageId: p.get("stage") || undefined };
  const page = p.get("page") as View["page"] | null;
  return page && ["dashboard", "tours", "members", "stats", "settings"].includes(page) ? ({ page } as View) : { page: "dashboard" };
}

const NAV: { page: View["page"]; label: string; icon: string }[] = [
  { page: "dashboard", label: "Übersicht", icon: "◧" },
  { page: "tours", label: "Touren", icon: "⛰" },
  { page: "members", label: "Mitfahrer", icon: "☺" },
  { page: "stats", label: "Statistik", icon: "▥" },
  { page: "settings", label: "Einstellungen", icon: "⚙" },
];

export default function App() {
  const store = useStore();
  const [view, setView] = useState<View>(initialView);
  const [about, setAbout] = useState(false);

  if (!store.ready) return <div className="loading">Lade Daten …</div>;

  const createTour = () => {
    const t = newTour(store.settings, store.members.map((m) => m.id));
    store.save("tours", t);
    setView({ page: "tour", id: t.id });
  };

  const active = view.page === "tour" ? "tours" : view.page;
  const { sync, config } = store;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <span className="logo">⛰</span>
          <span>Tourenplaner</span>
        </div>
        <button className="primary new" onClick={createTour}>
          + Neue Tour
        </button>
        <nav>
          {NAV.map((n) => (
            <button key={n.page} className={active === n.page ? "active" : ""} onClick={() => setView({ page: n.page } as View)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="sync-box">
          {config?.webdav.enabled ? (
            <>
              <button className="ghost small" disabled={sync.running} onClick={() => store.runSync()}>
                {sync.running ? "Synchronisiere …" : "⟳ Jetzt synchronisieren"}
              </button>
              {sync.error ? (
                <div className="sync-state error" title={sync.error} onClick={() => setView({ page: "settings", tab: "sync" })}>
                  Sync-Fehler – Details
                </div>
              ) : sync.last ? (
                <div className="sync-state">Zuletzt: {dateTime(sync.last.finishedAt)}</div>
              ) : null}
            </>
          ) : (
            <button className="link small" onClick={() => setView({ page: "settings", tab: "sync" })}>
              Nextcloud-Sync einrichten
            </button>
          )}
          <button className="link small about-link" onClick={() => setAbout(true)}>
            ⓘ Über Tourenplaner · v{APP_VERSION}
          </button>
        </div>
      </aside>
      {about && <AboutDialog onClose={() => setAbout(false)} />}
      <main className={`content ${view.page === "tour" ? "wide" : ""}`}>
        {store.saveError && (
          <div className="alert error banner">
            {store.saveError}
            <button className="icon" onClick={store.clearSaveError}>
              ×
            </button>
          </div>
        )}
        {view.page === "dashboard" && <Dashboard nav={setView} onNew={createTour} />}
        {view.page === "tours" && <Tours nav={setView} onNew={createTour} />}
        {view.page === "tour" && <TourDetail key={view.id} view={view} nav={setView} />}
        {view.page === "members" && <Members selected={view.id} />}
        {view.page === "stats" && <Statistics nav={setView} />}
        {view.page === "settings" && <SettingsPage tab={view.tab} />}
      </main>
    </div>
  );
}

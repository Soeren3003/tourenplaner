import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, type Collection } from "./api";
import { configureServices } from "./services";
import { defaultSettings, migrateMember, migrateSettings, migrateTour, now } from "./defaults";
import type { Expense, Hotel, LocalConfig, Member, Settings, Stage, SyncReport, Tour } from "./types";

type Entity = { id: string; updatedAt: string };

interface SyncStatus {
  running: boolean;
  last: SyncReport | null;
  error: string;
}

type ListCollection = Exclude<Collection, "settings">;

interface Data {
  tours: Tour[];
  stages: Stage[];
  hotels: Hotel[];
  expenses: Expense[];
  members: Member[];
}

interface Store extends Data {
  ready: boolean;
  settings: Settings;
  config: LocalConfig | null;
  sync: SyncStatus;
  saveError: string;
  /** Wer bin ich? Nur lokal gespeichert – Vorauswahl „bezahlt von“. */
  me: string;
  setMe: (id: string) => void;
  clearSaveError: () => void;
  saveSettings: (s: Settings) => void;
  save: <K extends ListCollection>(collection: K, item: Data[K][number]) => void;
  remove: (collection: ListCollection, id: string) => Promise<void>;
  deleteTour: (id: string) => Promise<void>;
  reload: () => Promise<void>;
  runSync: () => Promise<void>;
  setConfig: (c: LocalConfig) => void;
  flush: () => Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("StoreProvider fehlt");
  return s;
}

const SAVE_DELAY = 400;
const LISTS: ListCollection[] = ["tours", "stages", "hotels", "expenses", "members"];
const EMPTY: Data = { tours: [], stages: [], hotels: [], expenses: [], members: [] };

function readMe() {
  try {
    return localStorage.getItem("tourenplaner:me") ?? "";
  } catch {
    return "";
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [data, setData] = useState<Data>(EMPTY);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [sync, setSync] = useState<SyncStatus>({ running: false, last: null, error: "" });
  const [saveError, setSaveError] = useState("");
  const [me, setMeState] = useState(readMe);

  // Verzögertes Speichern: Tippen erzeugt nicht für jeden Buchstaben einen Schreibvorgang.
  const pending = useRef(new Map<string, { collection: Collection; value: Entity; timer: number }>());

  const persist = useCallback(async (collection: Collection, value: Entity) => {
    try {
      await api.dbPut(collection, value.id, value);
    } catch (e) {
      console.error(e);
      setSaveError(`Speichern fehlgeschlagen: ${e}`);
    }
  }, []);

  const schedule = useCallback(
    (collection: Collection, value: Entity) => {
      const k = `${collection}/${value.id}`;
      const prev = pending.current.get(k);
      if (prev) clearTimeout(prev.timer);
      const timer = window.setTimeout(() => {
        pending.current.delete(k);
        persist(collection, value);
      }, SAVE_DELAY);
      pending.current.set(k, { collection, value, timer });
    },
    [persist],
  );

  const cancel = (k: string) => {
    const it = pending.current.get(k);
    if (it) clearTimeout(it.timer);
    pending.current.delete(k);
  };

  const flush = useCallback(async () => {
    const items = [...pending.current.values()];
    pending.current.clear();
    for (const it of items) {
      clearTimeout(it.timer);
      await persist(it.collection, it.value);
    }
  }, [persist]);

  const reload = useCallback(async () => {
    const [s, ...lists] = await Promise.all([api.dbList<Settings>("settings"), ...LISTS.map((c) => api.dbList<Entity>(c))]);
    const stored = s.find((x) => x.id === "settings");
    const cur = stored ? migrateSettings(stored) : defaultSettings();
    configureServices(cur.services);
    setSettings(cur);
    if (!stored) await api.dbPut("settings", cur.id, cur);
    const next = { ...EMPTY } as Record<ListCollection, Entity[]>;
    LISTS.forEach((c, i) => (next[c] = lists[i]));
    next.members = (next.members as Member[]).map(migrateMember);
    next.tours = (next.tours as Tour[]).map((t) => migrateTour(t, cur));
    (next.members as Member[]).sort((a, b) => a.name.localeCompare(b.name, "de"));
    (next.tours as Tour[]).sort((a, b) => b.startDate.localeCompare(a.startDate));
    setData(next as unknown as Data);
  }, []);

  const runSync = useCallback(async () => {
    setSync((s) => ({ ...s, running: true, error: "" }));
    try {
      await flush();
      const report = await api.syncNow();
      setSync({ running: false, last: report, error: report.errors.length ? report.errors.join("\n") : "" });
      if (report.downloaded || report.deletedLocal || report.conflicts.length) await reload();
    } catch (e) {
      setSync((s) => ({ ...s, running: false, error: String(e) }));
    }
  }, [flush, reload]);

  useEffect(() => {
    (async () => {
      const cfg = await api.getConfig();
      setConfig(cfg);
      await reload();
      setReady(true);
      if (cfg.webdav.enabled) runSync();
    })();
    const onClose = () => void flush();
    window.addEventListener("beforeunload", onClose);
    return () => window.removeEventListener("beforeunload", onClose);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Automatischer Abgleich im eingestellten Intervall.
  useEffect(() => {
    const min = config?.webdav.enabled ? config.webdav.autoSyncMinutes : 0;
    if (!min) return;
    const t = window.setInterval(() => runSync(), min * 60_000);
    return () => clearInterval(t);
  }, [config, runSync]);

  const remove = useCallback(async (collection: ListCollection, id: string) => {
    cancel(`${collection}/${id}`);
    await api.dbDelete(collection, id);
    setData((d) => ({ ...d, [collection]: (d[collection] as Entity[]).filter((x) => x.id !== id) }));
  }, []);

  const value: Store = useMemo(
    () => ({
      ready,
      settings,
      ...data,
      config,
      sync,
      saveError,
      me,
      setMe: (id) => {
        setMeState(id);
        try {
          localStorage.setItem("tourenplaner:me", id);
        } catch {
          /* nur Komfort */
        }
      },
      clearSaveError: () => setSaveError(""),
      reload,
      runSync,
      flush,
      setConfig,
      saveSettings: (s) => {
        const v = { ...s, updatedAt: now() };
        configureServices(v.services);
        setSettings(v);
        schedule("settings", v);
      },
      save: (collection, item) => {
        const v = { ...item, updatedAt: now() };
        setData((d) => {
          const list = d[collection] as Entity[];
          const i = list.findIndex((x) => x.id === v.id);
          const copy = list.slice();
          if (i < 0) copy.push(v);
          else copy[i] = v;
          return { ...d, [collection]: copy };
        });
        schedule(collection, v);
      },
      remove,
      deleteTour: async (id) => {
        for (const c of ["stages", "hotels", "expenses"] as const) {
          for (const x of data[c].filter((x) => x.tourId === id)) await remove(c, x.id);
        }
        await api.filesDeleteAll(id);
        await remove("tours", id);
      },
    }),
    [ready, settings, data, config, sync, saveError, me, reload, runSync, flush, schedule, remove],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

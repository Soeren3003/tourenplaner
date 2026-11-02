import { useEffect, useState } from "react";
import { Field, NumberInput } from "../components/ui";
import { api, inTauri, pickFolder } from "../lib/api";
import { CURRENCIES, DEFAULT_CHECKLIST } from "../lib/defaults";
import { dateTime } from "../lib/format";
import { useStore } from "../lib/store";
import type { LocalConfig, Settings } from "../lib/types";

const TABS = [
  ["allgemein", "Planung"],
  ["checkliste", "Checklisten-Vorlage"],
  ["sync", "Daten & Sync"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function SettingsPage({ tab: initial }: { tab?: string }) {
  const store = useStore();
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t[0] === initial)?.[0] ?? "allgemein") as Tab);
  const s = store.settings;
  const set = (patch: Partial<Settings>) => store.saveSettings({ ...s, ...patch });
  const ro = s.defaultRouteOptions;

  return (
    <div className="page">
      <div className="page-head">
        <h1>Einstellungen</h1>
      </div>
      <div className="tabs">
        {TABS.map(([id, label]) => (
          <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "allgemein" && (
        <section className="card">
          <h2>Vorgaben für neue Touren und Etappen</h2>
          <div className="form-grid">
            <Field label="Währung">
              <select value={s.defaultCurrency} onChange={(e) => set({ defaultCurrency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Spritpreis">
              <NumberInput value={s.defaultFuelPrice} suffix={`${s.defaultCurrency}/l`} onChange={(v) => set({ defaultFuelPrice: v ?? 0 })} />
            </Field>
            <Field label="Strompreis (Ladesäule)">
              <NumberInput value={s.defaultElectricityPrice} suffix={`${s.defaultCurrency}/kWh`} onChange={(v) => set({ defaultElectricityPrice: v ?? 0 })} />
            </Field>
            <Field label="Abfahrtszeit">
              <input type="time" value={s.defaultDeparture} onChange={(e) => set({ defaultDeparture: e.target.value })} />
            </Field>
            <Field label="Pausen pro Tag">
              <NumberInput value={s.defaultPauseMinutes} digits={0} suffix="min" onChange={(v) => set({ defaultPauseMinutes: v ?? 0 })} />
            </Field>
            <Field label="Reichweiten-Reserve" hint="Getankt bzw. geladen wird, wenn dieser Anteil der Reichweite erreicht ist.">
              <NumberInput value={Math.round(s.tankReserve * 100)} digits={0} suffix="%" min={30} onChange={(v) => set({ tankReserve: Math.min(1, (v ?? 80) / 100) })} />
            </Field>
            <Field label="Autobahnen">
              <select value={ro.useHighways} onChange={(e) => set({ defaultRouteOptions: { ...ro, useHighways: Number(e.target.value) } })}>
                <option value={0}>meiden (kurvig)</option>
                <option value={0.1}>möglichst wenig</option>
                <option value={0.5}>normal</option>
                <option value={1}>bevorzugen (schnell)</option>
              </select>
            </Field>
            <label className="check">
              <input type="checkbox" checked={ro.avoidTolls} onChange={(e) => set({ defaultRouteOptions: { ...ro, avoidTolls: e.target.checked } })} />
              Maut meiden
            </label>
            <label className="check">
              <input type="checkbox" checked={ro.avoidFerries} onChange={(e) => set({ defaultRouteOptions: { ...ro, avoidFerries: e.target.checked } })} />
              Fähren meiden
            </label>
          </div>
          <p className="muted small">
            Routing: Valhalla (FOSSGIS) mit Motorrad-Profil · Ortssuche: Nominatim · Wetter: Open-Meteo · Karten: OpenStreetMap, CARTO, OpenTopoMap, Esri. Alle
            Dienste sind kostenlos und brauchen keinen Schlüssel – für sehr kurvige Routen eine Strecke in Kurviger oder Calimoto planen und als GPX importieren.
          </p>
        </section>
      )}

      {tab === "checkliste" && (
        <section className="card narrow">
          <h2>Vorlage für neue Touren</h2>
          <p className="muted small">Ein Punkt pro Zeile. Bestehende Touren lassen sich über „Vorlage ergänzen“ in der Checkliste aktualisieren.</p>
          <TemplateEditor value={s.checklistTemplate} onChange={(checklistTemplate) => set({ checklistTemplate })} />
          <button className="link small" onClick={() => set({ checklistTemplate: DEFAULT_CHECKLIST })}>
            Auf Standard zurücksetzen
          </button>
        </section>
      )}

      {tab === "sync" && <SyncSettings />}
    </div>
  );
}

/** Zeilen werden erst beim Verlassen übernommen, damit Leerzeilen beim Tippen erhalten bleiben. */
function TemplateEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join("\n"));
  useEffect(() => setText(value.join("\n")), [value]);
  return (
    <textarea
      rows={18}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onChange(
          text
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

function SyncSettings() {
  const store = useStore();
  const [cfg, setCfg] = useState<LocalConfig | null>(store.config);
  const [password, setPassword] = useState("");
  const [hasPw, setHasPw] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.hasPassword().then(setHasPw);
  }, []);

  if (!cfg) return null;
  const w = cfg.webdav;
  const setW = (patch: Partial<LocalConfig["webdav"]>) => setCfg({ ...cfg, webdav: { ...w, ...patch } });
  const dirty = JSON.stringify(cfg) !== JSON.stringify(store.config) || password !== "";

  const save = async () => {
    const keychain = await api.saveConfig(cfg, password || undefined);
    const dataChanged = cfg.dataDir !== store.config?.dataDir;
    store.setConfig(cfg);
    if (password) setHasPw(true);
    setPassword("");
    if (dataChanged) await store.reload();
    setMsg({ ok: true, text: keychain ? "Gespeichert." : "Gespeichert. Hinweis: Kein Schlüsselbund verfügbar – Passwort liegt in der lokalen Konfigurationsdatei." });
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    try {
      if (dirty) await save();
      setMsg({ ok: true, text: await api.testConnection() });
    } catch (e) {
      setMsg({ ok: false, text: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const last = store.sync.last;

  return (
    <>
      <section className="card">
        <h2>Datenordner</h2>
        <p className="muted small">
          Hier liegen Touren, Etappen, Unterkünfte, Ausgaben und Dokumente. Der Ordner muss <strong>nicht</strong> im Nextcloud-Client liegen – die
          App synchronisiert selbst per WebDAV.
        </p>
        <div className="row">
          <code className="path">{cfg.dataDir}</code>
          <button className="ghost small" disabled={!inTauri} onClick={() => api.openDataDir()}>
            Öffnen
          </button>
          <button
            className="ghost small"
            disabled={!inTauri}
            onClick={async () => {
              const d = await pickFolder("Datenordner wählen");
              if (d) setCfg({ ...cfg, dataDir: d });
            }}
          >
            Ändern …
          </button>
        </div>
      </section>
      <section className="card">
        <h2>Nextcloud / WebDAV</h2>
        <p className="muted small">
          Für die ganze Gruppe: Einen Ordner in Nextcloud anlegen und mit allen Mitfahrern teilen (Bearbeiten erlaubt). Jeder trägt hier seinen eigenen
          Benutzer ein und als Ordner den Pfad, unter dem der geteilte Ordner bei ihm erscheint.
        </p>
        <label className="check">
          <input type="checkbox" checked={w.enabled} onChange={(e) => setW({ enabled: e.target.checked })} />
          Synchronisation aktivieren
        </label>
        <div className="form-grid">
          <Field label="Server-Adresse" wide hint="Nextcloud-Adresse (https://cloud.example.com) oder vollständige WebDAV-URL aus Nextcloud → Dateien → Einstellungen.">
            <input value={w.url} placeholder="https://…" onChange={(e) => setW({ url: e.target.value })} />
          </Field>
          <Field label="Benutzername">
            <input value={w.username} onChange={(e) => setW({ username: e.target.value })} autoComplete="off" />
          </Field>
          <Field label="App-Passwort" hint={hasPw ? "Gespeichert im Schlüsselbund. Nur ausfüllen zum Ändern." : "Nextcloud → Einstellungen → Sicherheit → „Neues App-Passwort erstellen“."}>
            <input type="password" value={password} placeholder={hasPw ? "••••••••" : ""} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label="Ordner auf dem Server" hint="Wird angelegt, falls nicht vorhanden.">
            <input value={w.remoteFolder} onChange={(e) => setW({ remoteFolder: e.target.value })} />
          </Field>
          <Field label="Automatisch synchronisieren">
            <select value={w.autoSyncMinutes} onChange={(e) => setW({ autoSyncMinutes: Number(e.target.value) })}>
              <option value={0}>Nur beim Start und manuell</option>
              <option value={5}>alle 5 Minuten</option>
              <option value={15}>alle 15 Minuten</option>
              <option value={60}>stündlich</option>
            </select>
          </Field>
        </div>
        {msg && <div className={`alert ${msg.ok ? "ok" : "error"}`}>{msg.text}</div>}
        <div className="row">
          <button className="primary" disabled={!dirty} onClick={() => save().catch((e) => setMsg({ ok: false, text: String(e) }))}>
            Speichern
          </button>
          <button disabled={busy || !w.url || !inTauri} onClick={test}>
            Verbindung testen
          </button>
          <button disabled={!w.enabled || store.sync.running || dirty || !inTauri} onClick={() => store.runSync()}>
            {store.sync.running ? "Synchronisiere …" : "Jetzt synchronisieren"}
          </button>
        </div>
      </section>
      {(last || store.sync.error) && (
        <section className="card">
          <h2>Letzte Synchronisation</h2>
          {last && (
            <p>
              {dateTime(last.finishedAt)}: {last.uploaded} hochgeladen, {last.downloaded} heruntergeladen, {last.deletedLocal + last.deletedRemote} gelöscht.
            </p>
          )}
          {last && last.conflicts.length > 0 && (
            <div className="alert">
              {last.conflicts.length} Konflikt(e) – auf beiden Geräten geändert. Die neuere Version wurde behalten, die andere liegt im Datenordner unter
              „conflicts“:
              <ul>
                {last.conflicts.map((c) => (
                  <li key={c}>
                    <code>{c}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {store.sync.error && <pre className="alert error">{store.sync.error}</pre>}
        </section>
      )}
    </>
  );
}

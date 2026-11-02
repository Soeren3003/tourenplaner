import { useEffect, useState } from "react";
import { Field, NumberInput } from "../components/ui";
import { api, inTauri, pickFolder } from "../lib/api";
import { CURRENCIES, DEFAULT_CHECKLIST, DEFAULT_SERVICES } from "../lib/defaults";
import { dateTime } from "../lib/format";
import { useStore } from "../lib/store";
import type { LocalConfig, ServiceSettings, Settings } from "../lib/types";

const TABS = [
  ["allgemein", "Planung"],
  ["checkliste", "Checklisten-Vorlage"],
  ["dienste", "Online-Dienste"],
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
            Routing mit Motorrad-Profil über Valhalla (Server und Bedingungen unter „Online-Dienste“). Für sehr kurvige Routen eine Strecke in
            Kurviger oder Calimoto planen und als GPX importieren.
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

      {tab === "dienste" && <ServiceSettingsCard />}
      {tab === "sync" && <SyncSettings />}
    </div>
  );
}

function ExtLink({ href, children }: { href: string; children: string }) {
  return <a href={href}>{children}</a>;
}

/** Online-Dienste: an-/abschalten und eigene Server eintragen. Gilt für die ganze Gruppe (wird synchronisiert). */
function ServiceSettingsCard() {
  const store = useStore();
  const sv = store.settings.services;
  const set = (patch: Partial<ServiceSettings>) => store.saveSettings({ ...store.settings, services: { ...sv, ...patch } });
  const https = (u: string) => /^https:\/\/[^/]+/.test(u.trim());
  return (
    <section className="card narrow">
      <h2>Online-Dienste</h2>
      <p className="muted small">
        Die App nutzt freie, ehrenamtlich oder gemeinnützig betriebene Dienste. Ihre Nutzungsbedingungen gelten zusätzlich zur MIT-Lizenz der App.
        Diese Einstellungen werden mit der Gruppe synchronisiert.
      </p>

      <h3>Routing (Valhalla)</h3>
      <Field label="Server" hint="Standard: FOSSGIS e. V. – höchstens 1 Anfrage pro Sekunde, gewerbliche Nutzung nur eingeschränkt erlaubt.">
        <input value={sv.routingUrl} className={https(sv.routingUrl) ? "" : "invalid"} onChange={(e) => set({ routingUrl: e.target.value })} />
      </Field>
      <p className="small">
        <ExtLink href="https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/">Nutzungsbedingungen FOSSGIS</ExtLink>
      </p>

      <h3>Ortssuche (Nominatim)</h3>
      <label className="check">
        <input type="checkbox" checked={sv.geocoding} onChange={(e) => set({ geocoding: e.target.checked })} />
        Ortssuche und automatische Ortsnamen verwenden
      </label>
      <Field label="Server" hint="Standard: OpenStreetMap Foundation – höchstens 1 Anfrage pro Sekunde für alle Nutzer der App zusammen, keine Autovervollständigung.">
        <input value={sv.geocodingUrl} className={https(sv.geocodingUrl) ? "" : "invalid"} disabled={!sv.geocoding} onChange={(e) => set({ geocodingUrl: e.target.value })} />
      </Field>
      <p className="small">
        <ExtLink href="https://operations.osmfoundation.org/policies/nominatim/">Nutzungsrichtlinie Nominatim</ExtLink>
      </p>

      <h3>Wetter (Open-Meteo)</h3>
      <label className="check">
        <input type="checkbox" checked={sv.weather} onChange={(e) => set({ weather: e.target.checked })} />
        Wettervorhersage anzeigen
      </label>
      <p className="muted small">
        Die kostenlose Open-Meteo-Schnittstelle ist nur für <strong>nicht-kommerzielle</strong> Nutzung erlaubt (z. B. private Touren).
        Bei gewerblicher Nutzung bitte ausschalten oder ein Abo bei Open-Meteo abschließen. Daten unter CC BY 4.0.{" "}
        <ExtLink href="https://open-meteo.com/en/terms">Nutzungsbedingungen</ExtLink>
      </p>

      <h3>Karten</h3>
      <p className="muted small">
        Kartenkacheln von OpenStreetMap und OpenTopoMap (umschaltbar in der Karte). Quellenangabe und „Fehler melden“ stehen unten rechts in der
        Karte. <ExtLink href="https://operations.osmfoundation.org/policies/tiles/">Nutzungsrichtlinie OSM-Kacheln</ExtLink>
      </p>

      <button className="link small" onClick={() => set({ ...DEFAULT_SERVICES })}>
        Auf Standard zurücksetzen
      </button>
    </section>
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

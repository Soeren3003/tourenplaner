import type { FileMeta, LocalConfig, SyncReport } from "./types";

/** Läuft die Oberfläche in der App (Tauri) oder nur im Browser (Entwicklung)? */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!inTauri) return mock(cmd, args) as T;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export type Collection = "tours" | "stages" | "hotels" | "expenses" | "members" | "settings";

export const api = {
  getConfig: () => call<LocalConfig>("get_config"),
  saveConfig: (config: LocalConfig, password?: string) => call<boolean>("save_config", { config, password }),
  hasPassword: () => call<boolean>("has_password"),
  testConnection: () => call<string>("test_connection"),
  syncNow: () => call<SyncReport>("sync_now"),

  dbList: <T>(collection: Collection) => call<T[]>("db_list", { collection }),
  dbPut: (collection: Collection, id: string, value: unknown) => call<void>("db_put", { collection, id, value }),
  dbDelete: (collection: Collection, id: string) => call<void>("db_delete", { collection, id }),

  filesList: (tourId: string) => call<FileMeta[]>("files_list", { tourId }),
  filesImport: (tourId: string, paths: string[]) => call<FileMeta[]>("files_import", { tourId, paths }),
  filesDelete: (tourId: string, name: string) => call<void>("files_delete", { tourId, name }),
  filesDeleteAll: (tourId: string) => call<void>("files_delete_all", { tourId }),
  filesRename: (tourId: string, name: string, newName: string) => call<void>("files_rename", { tourId, name, newName }),
  filesOpen: (tourId: string, name: string) => call<void>("files_open", { tourId, name }),
  filesReveal: (tourId: string, name?: string) => call<void>("files_reveal", { tourId, name }),

  exportFile: (target: string, bytes: Uint8Array) => call<void>("export_file", { target, bytes: Array.from(bytes) }),
  readTextFile: (path: string) => call<string>("read_text_file", { path }),
  webRequest: (url: string, body?: unknown) => call<string>("web_request", { url, body: body === undefined ? null : JSON.stringify(body) }),
  openUrl: (url: string) => (inTauri ? call<void>("open_url", { url }) : Promise.resolve(void window.open(url, "_blank"))),
  openDataDir: () => call<void>("open_data_dir"),
};

export async function pickFiles(title = "Dokumente zur Tour hinzufügen", extensions?: string[]): Promise<string[]> {
  if (!inTauri) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ multiple: true, title, filters: extensions ? [{ name: extensions.join(", ").toUpperCase(), extensions }] : undefined });
  return r ? (Array.isArray(r) ? r : [r]) : [];
}

/** Datei im Browser auswählen und als Text lesen (Vorschau ohne Tauri). */
function browserPickText(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve);
    };
    input.click();
  });
}

export async function pickTextFile(title: string, extensions: string[]): Promise<string | null> {
  if (!inTauri) return browserPickText(extensions.map((e) => `.${e}`).join(","));
  const [p] = await pickFiles(title, extensions);
  return p ? api.readTextFile(p) : null;
}

export async function pickFolder(title: string): Promise<string | null> {
  if (!inTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const r = await open({ directory: true, title });
  return typeof r === "string" ? r : null;
}

/** Speichern-Dialog; im Browser wird die Datei direkt heruntergeladen. */
export async function saveAs(defaultPath: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  const ext = defaultPath.split(".").pop() ?? "";
  if (!inTauri) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    a.download = defaultPath;
    a.click();
    return true;
  }
  const { save } = await import("@tauri-apps/plugin-dialog");
  const target = await save({ defaultPath, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (!target) return false;
  await api.exportFile(target, bytes);
  return true;
}

export async function confirmDialog(message: string, title = "Tourenplaner"): Promise<boolean> {
  if (!inTauri) return window.confirm(message);
  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, { title, kind: "warning", okLabel: "Ja", cancelLabel: "Abbrechen" });
}

/** Dateien, die auf das Fenster gezogen werden. */
export async function onFileDrop(handler: (paths: string[]) => void, hover?: (over: boolean) => void) {
  if (!inTauri) return () => {};
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  return getCurrentWebview().onDragDropEvent((e) => {
    const p = e.payload;
    if (p.type === "over" || p.type === "enter") hover?.(true);
    else if (p.type === "leave") hover?.(false);
    else if (p.type === "drop") {
      hover?.(false);
      handler(p.paths);
    }
  });
}

// ---------- Browser-Ersatz für die Entwicklung ohne Tauri ----------

function mock(cmd: string, args: Record<string, unknown>): unknown {
  const key = (c: unknown) => `tourenplaner:${c}`;
  const read = (c: unknown): Record<string, unknown> => JSON.parse(localStorage.getItem(key(c)) || "{}");
  const write = (c: unknown, v: Record<string, unknown>) => localStorage.setItem(key(c), JSON.stringify(v));
  switch (cmd) {
    case "get_config":
      return { dataDir: "(Browser-Vorschau)", webdav: { enabled: false, url: "", username: "", remoteFolder: "Tourenplaner", autoSyncMinutes: 0 } };
    case "db_list":
      return Object.values(read(args.collection));
    case "db_put": {
      const all = read(args.collection);
      all[args.id as string] = args.value;
      write(args.collection, all);
      return;
    }
    case "db_delete": {
      const all = read(args.collection);
      delete all[args.id as string];
      write(args.collection, all);
      return;
    }
    case "files_list":
      return [];
    case "has_password":
      return false;
    case "web_request":
      // Im Browser direkt anfragen (die Dienste erlauben CORS).
      return fetch(args.url as string, args.body ? { method: "POST", body: args.body as string, headers: { "Content-Type": "application/json" } } : undefined).then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
        return r.text();
      });
    default:
      return undefined;
  }
}

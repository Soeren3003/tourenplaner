import { useCallback, useEffect, useState } from "react";
import { Empty, Field, Modal } from "../../components/ui";
import { api, confirmDialog, inTauri, onFileDrop, pickFiles } from "../../lib/api";
import { bytes, dateTime } from "../../lib/format";
import type { FileMeta, Tour } from "../../lib/types";

export default function Files({ tour }: { tour: Tour }) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [hover, setHover] = useState(false);
  const [error, setError] = useState("");
  const [renaming, setRenaming] = useState<{ from: string; to: string } | null>(null);

  const load = useCallback(async () => setFiles(await api.filesList(tour.id)), [tour.id]);

  const importPaths = useCallback(
    async (paths: string[]) => {
      if (!paths.length) return;
      try {
        setError("");
        await api.filesImport(tour.id, paths);
        await load();
      } catch (e) {
        setError(String(e));
      }
    },
    [tour.id, load],
  );

  useEffect(() => {
    load();
    let off: (() => void) | undefined;
    onFileDrop(importPaths, setHover).then((u) => (off = u));
    return () => off?.();
  }, [load, importPaths]);

  const remove = async (name: string) => {
    if (!(await confirmDialog(`„${name}“ löschen?`))) return;
    await api.filesDelete(tour.id, name);
    load();
  };

  const rename = async () => {
    if (!renaming) return;
    const n = renaming.to.trim();
    if (!n || n === renaming.from) return setRenaming(null);
    try {
      await api.filesRename(tour.id, renaming.from, n);
      setRenaming(null);
      load();
    } catch (e) {
      setError(String(e));
      setRenaming(null);
    }
  };

  return (
    <section className={`card files ${hover ? "drop-hover" : ""}`}>
      <div className="card-head">
        <h2>Dokumente</h2>
        <div className="row">
          <button className="ghost small" onClick={() => api.filesReveal(tour.id)} disabled={!inTauri}>
            Ordner öffnen
          </button>
          <button className="primary small" onClick={async () => importPaths(await pickFiles())} disabled={!inTauri}>
            + Dateien hinzufügen
          </button>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {files.length === 0 ? (
        <Empty>
          Buchungsbestätigungen, Vignetten, Fährtickets, GPX-Dateien oder Fotos hierher ziehen
          <br />
          oder „Dateien hinzufügen“ nutzen. Alles wird mit der Gruppe synchronisiert.
        </Empty>
      ) : (
        <ul className="file-list">
          {files.map((f) => (
            <li key={f.name}>
              <div className="thumb">
                <span>{f.name.split(".").pop()?.toUpperCase()}</span>
              </div>
              <div className="file-main">
                <button className="link file-name" onClick={() => api.filesOpen(tour.id, f.name)} title="Mit Standardprogramm öffnen">
                  {f.name}
                </button>
                <div className="muted small">
                  {bytes(f.size)} · {dateTime(new Date(f.modified).toISOString())}
                </div>
              </div>
              <div className="file-actions">
                <button className="ghost small" onClick={() => api.filesReveal(tour.id, f.name)}>
                  Zeigen
                </button>
                <button className="ghost small" onClick={() => setRenaming({ from: f.name, to: f.name })}>
                  Umbenennen
                </button>
                <button className="ghost small danger" onClick={() => remove(f.name)}>
                  Löschen
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {renaming && (
        <Modal
          title="Datei umbenennen"
          onClose={() => setRenaming(null)}
          footer={
            <>
              <button onClick={() => setRenaming(null)}>Abbrechen</button>
              <button className="primary" onClick={rename}>
                Umbenennen
              </button>
            </>
          }
        >
          <Field label="Neuer Dateiname">
            <input autoFocus value={renaming.to} onChange={(e) => setRenaming({ ...renaming, to: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} />
          </Field>
        </Modal>
      )}
    </section>
  );
}

import { useEffect, useMemo, useState } from "react";
import list from "../generated/third-party.json";
import { api } from "../lib/api";
import { Modal } from "./ui";

interface Component {
  kind: "npm" | "crate";
  name: string;
  version: string;
  license: string;
  url: string;
}

const components = list as Component[];

/** Lizenztexte aus THIRD_PARTY_LICENSES.md je Komponente („### name version“) */
function splitSections(md: string) {
  const map = new Map<string, string>();
  const parts = md.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    map.set(part.slice(0, nl).trim(), part.slice(nl + 1).replace(/```text\n?|```/g, "").trim());
  }
  return map;
}

export function ThirdPartyDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState("");
  const [texts, setTexts] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    // groß (~800 KB) – erst beim Öffnen des Fensters laden
    import("../../THIRD_PARTY_LICENSES.md?raw").then((m) => setTexts(splitSections(m.default)));
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? components.filter((c) => `${c.name} ${c.license}`.toLowerCase().includes(t)) : components;
  }, [q]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of components) m.set(c.license, (m.get(c.license) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, []);

  return (
    <Modal title="Lizenzen der Komponenten" onClose={onClose} footer={<button className="primary" onClick={onClose}>Schließen</button>}>
      <p className="small">
        Der Tourenplaner enthält {components.length} Komponenten anderer Autorinnen und Autoren:{" "}
        {components.filter((c) => c.kind === "npm").length} für die Oberfläche (npm) und {components.filter((c) => c.kind === "crate").length} für die
        Desktop-Hülle (Rust). Alle stehen unter freien Lizenzen, die eine Weitergabe mit diesen Hinweisen erlauben. Bei Wahlmöglichkeit wird die
        MIT-Lizenz genutzt.
      </p>
      <p className="muted small">{counts.map(([l, n]) => `${l}: ${n}`).join(" · ")}</p>
      <input className="search full" placeholder="Komponente oder Lizenz suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="third-party">
        {shown.map((c) => {
          const key = `${c.name} ${c.version}`;
          return (
            <li key={key}>
              <div className="row between">
                <button className="link" onClick={() => setOpen(open === key ? "" : key)}>
                  {open === key ? "▾" : "▸"} {c.name} <span className="muted">{c.version}</span>
                </button>
                <span className="small muted">{c.license}</span>
              </div>
              {open === key && (
                <div className="tp-detail">
                  <button className="link small" onClick={() => api.openUrl(c.url.replace(/^git\+/, "").replace(/\.git$/, ""))}>
                    {c.url.replace(/^git\+/, "")}
                  </button>
                  <pre className="license-text">{texts ? (texts.get(key) ?? "–") : "Lade …"}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

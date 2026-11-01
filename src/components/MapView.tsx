import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { bounds } from "../lib/geo";
import type { LatLon } from "../lib/types";

export interface MapLine {
  id: string;
  points: LatLon[];
  color: string;
  weight?: number;
  dashed?: boolean;
  tooltip?: string;
  onClick?: () => void;
}

export interface MapMarker {
  id: string;
  pos: LatLon;
  /** kurzer Text im Kreis, z. B. Nummer oder Symbol */
  label: string;
  color: string;
  title?: string;
  shape?: "circle" | "square";
  draggable?: boolean;
  onDragEnd?: (p: LatLon) => void;
  onClick?: () => void;
  onContextMenu?: () => void;
}

const LAYERS: Record<string, { name: string; url: string; attribution: string; maxZoom: number }> = {
  osm: {
    name: "OpenStreetMap",
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  street: {
    name: "Esri Straßenkarte",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
  topo: {
    name: "Topografisch",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    maxZoom: 17,
  },
  satellite: {
    name: "Satellit",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxZoom: 19,
  },
};

const LAYER_KEY = "tourenplaner:layer";

function storedLayer() {
  try {
    const v = localStorage.getItem(LAYER_KEY);
    return v && LAYERS[v] ? v : "osm";
  } catch {
    return "osm";
  }
}

function icon(m: MapMarker) {
  const esc = m.label.replace(/[<>&]/g, "");
  return L.divIcon({
    className: "map-pin-wrap",
    html: `<div class="map-pin ${m.shape === "square" ? "square" : ""}" style="background:${m.color}">${esc}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

export default function MapView({
  lines = [],
  markers = [],
  onMapClick,
  fitKey,
  className = "",
  hint,
}: {
  lines?: MapLine[];
  markers?: MapMarker[];
  onMapClick?: (p: LatLon, shift: boolean) => void;
  /** ändert sich der Wert, wird auf alle Linien und Punkte gezoomt */
  fitKey?: string;
  className?: string;
  hint?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const overlay = useRef<L.LayerGroup | null>(null);
  const clickRef = useRef(onMapClick);
  clickRef.current = onMapClick;

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([47.5, 10.5], 6);
    const base: Record<string, L.TileLayer> = {};
    for (const l of Object.values(LAYERS)) base[l.name] = L.tileLayer(l.url, { attribution: l.attribution, maxZoom: l.maxZoom, detectRetina: false });
    base[LAYERS[storedLayer()].name].addTo(m);
    // Blockiert der OSM-Server die App (fehlender Referer), auf Esri ausweichen.
    let osmErrors = 0;
    base[LAYERS.osm.name].on("tileerror", () => {
      if (++osmErrors === 4 && m.hasLayer(base[LAYERS.osm.name])) {
        m.removeLayer(base[LAYERS.osm.name]);
        base[LAYERS.street.name].addTo(m);
      }
    });
    L.control.layers(base, undefined, { position: "topright" }).addTo(m);
    L.control.scale({ imperial: false }).addTo(m);
    m.on("baselayerchange", (e: L.LayersControlEvent) => {
      const id = Object.keys(LAYERS).find((k) => LAYERS[k].name === e.name);
      try {
        if (id) localStorage.setItem(LAYER_KEY, id);
      } catch {
        /* egal */
      }
    });
    m.on("click", (e: L.LeafletMouseEvent) => clickRef.current?.({ lat: e.latlng.lat, lon: e.latlng.lng }, e.originalEvent.shiftKey));
    overlay.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.stop();
      m.off();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = overlay.current;
    if (!g) return;
    g.clearLayers();
    for (const l of lines) {
      if (l.points.length < 2) continue;
      const ll = l.points.map((p) => [p.lat, p.lon] as [number, number]);
      // weißer Rand für Lesbarkeit auf jeder Karte
      L.polyline(ll, { color: "#fff", weight: (l.weight ?? 5) + 3, opacity: 0.8, interactive: false }).addTo(g);
      const pl = L.polyline(ll, { color: l.color, weight: l.weight ?? 5, opacity: 0.95, dashArray: l.dashed ? "8 8" : undefined }).addTo(g);
      if (l.tooltip) pl.bindTooltip(l.tooltip, { sticky: true });
      if (l.onClick) pl.on("click", (e) => (L.DomEvent.stopPropagation(e), l.onClick!()));
    }
    for (const mk of markers) {
      const marker = L.marker([mk.pos.lat, mk.pos.lon], { icon: icon(mk), draggable: !!mk.draggable, title: mk.title, autoPan: true }).addTo(g);
      if (mk.title) marker.bindTooltip(mk.title, { direction: "top", offset: [0, -12] });
      if (mk.onDragEnd) marker.on("dragend", () => mk.onDragEnd!({ lat: marker.getLatLng().lat, lon: marker.getLatLng().lng }));
      if (mk.onClick) marker.on("click", mk.onClick);
      if (mk.onContextMenu) marker.on("contextmenu", mk.onContextMenu);
    }
  }, [lines, markers]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const b = bounds([...lines.flatMap((l) => l.points), ...markers.map((x) => x.pos)]);
    if (b) m.fitBounds(b, { padding: [30, 30], maxZoom: 13, animate: false });
    // nur bei geändertem Schlüssel neu ausrichten, nicht bei jeder Bearbeitung
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  return (
    <div className={`map-box ${className}`}>
      <div ref={el} className="map" />
      {hint && <div className="map-hint">{hint}</div>}
    </div>
  );
}

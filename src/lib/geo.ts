import type { LatLon, Waypoint } from "./types";

/** Entfernung zweier Punkte in km (Haversine). */
export function haversine(a: LatLon, b: LatLon) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLength(points: LatLon[]) {
  let d = 0;
  for (let i = 1; i < points.length; i++) d += haversine(points[i - 1], points[i]);
  return d;
}

/** Google-Polyline dekodieren (precision 5 = OSRM/Google, 6 = Valhalla). */
export function decodePolyline(s: string, precision = 5): LatLon[] {
  const factor = 10 ** precision;
  const out: LatLon[] = [];
  let i = 0;
  let lat = 0;
  let lon = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = s.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20 && i <= s.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < s.length) {
    lat += next();
    lon += next();
    out.push({ lat: lat / factor, lon: lon / factor });
  }
  return out;
}

export function encodePolyline(points: LatLon[], precision = 5): string {
  const factor = 10 ** precision;
  let out = "";
  let pLat = 0;
  let pLon = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    while (n >= 0x20) {
      out += String.fromCharCode((0x20 | (n & 0x1f)) + 63);
      n >>= 5;
    }
    out += String.fromCharCode(n + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * factor);
    const lon = Math.round(p.lon * factor);
    enc(lat - pLat);
    enc(lon - pLon);
    pLat = lat;
    pLon = lon;
  }
  return out;
}

/** Douglas-Peucker in grober Näherung (Grad als Einheit); hält gespeicherte Tracks klein. */
export function simplify(points: LatLon[], tolerance = 0.00005): LatLon[] {
  if (points.length < 3) return points;
  const sq = (p: LatLon, a: LatLon, b: LatLon) => {
    let x = a.lon;
    let y = a.lat;
    let dx = b.lon - x;
    let dy = b.lat - y;
    if (dx !== 0 || dy !== 0) {
      const t = ((p.lon - x) * dx + (p.lat - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) {
        x = b.lon;
        y = b.lat;
      } else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    dx = p.lon - x;
    dy = p.lat - y;
    return dx * dx + dy * dy;
  };
  const tol = tolerance * tolerance;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let max = 0;
    let idx = 0;
    for (let i = first + 1; i < last; i++) {
      const d = sq(points[i], points[first], points[last]);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol) {
      keep[idx] = 1;
      stack.push([first, idx], [idx, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Position, an der ein neuer Punkt den kleinsten Umweg erzeugt –
 * inklusive Anhängen vor dem Start oder nach dem Ziel.
 */
export function bestInsertIndex(points: LatLon[], p: LatLon): number {
  if (points.length < 2) return points.length;
  let best = points.length;
  let bestCost = haversine(points[points.length - 1], p);
  const startCost = haversine(p, points[0]);
  if (startCost < bestCost) {
    best = 0;
    bestCost = startCost;
  }
  for (let i = 1; i < points.length; i++) {
    const cost = haversine(points[i - 1], p) + haversine(p, points[i]) - haversine(points[i - 1], points[i]);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

export function bounds(points: LatLon[]): [[number, number], [number, number]] | null {
  if (!points.length) return null;
  let s = 90;
  let w = 180;
  let n = -90;
  let e = -180;
  for (const p of points) {
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
    w = Math.min(w, p.lon);
    e = Math.max(e, p.lon);
  }
  return [
    [s, w],
    [n, e],
  ];
}

export function coord(p: LatLon) {
  return `${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`;
}

// ---------- GPX ----------

export interface GpxData {
  name: string;
  track: LatLon[];
  waypoints: { lat: number; lon: number; name: string }[];
  /** Fahrzeit laut Zeitstempeln (nur bei aufgezeichneten Tracks) */
  recordedMinutes: number | null;
}

/** Liest Tracks (trkpt), Routen (rtept) und Wegpunkte (wpt) aus einer GPX-Datei. */
export function parseGpx(xml: string): GpxData {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Keine gültige GPX-Datei.");
  const read = (el: Element) => ({ lat: Number(el.getAttribute("lat")), lon: Number(el.getAttribute("lon")) });
  const valid = (p: LatLon) => Number.isFinite(p.lat) && Number.isFinite(p.lon);
  const text = (el: Element | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";

  const trkpts = [...doc.getElementsByTagName("trkpt")];
  const rtepts = [...doc.getElementsByTagName("rtept")];
  const track = (trkpts.length ? trkpts : rtepts).map(read).filter(valid);
  const wpts = [...doc.getElementsByTagName("wpt")];
  let waypoints = wpts.map((w) => ({ ...read(w), name: text(w, "name") })).filter(valid);
  // Routen aus Kurviger/Calimoto: Routenpunkte sind die Wegpunkte, falls es keinen Track gibt
  if (!waypoints.length && rtepts.length && trkpts.length) {
    waypoints = rtepts.map((w) => ({ ...read(w), name: text(w, "name") })).filter(valid);
  }

  let recordedMinutes: number | null = null;
  if (trkpts.length > 1) {
    const t0 = Date.parse(text(trkpts[0], "time"));
    const t1 = Date.parse(text(trkpts[trkpts.length - 1], "time"));
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) recordedMinutes = Math.round((t1 - t0) / 60000);
  }

  const name = text(doc.getElementsByTagName("metadata")[0], "name") || text(doc.getElementsByTagName("trk")[0], "name") || text(doc.getElementsByTagName("rte")[0], "name");
  if (!track.length) throw new Error("Die GPX-Datei enthält keinen Track und keine Route.");
  return { name, track, waypoints, recordedMinutes };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface GpxStage {
  name: string;
  waypoints: Waypoint[];
  track: LatLon[];
}

/**
 * GPX 1.1 mit Route (rte, für Navis die neu berechnen) und Track (trk, exakter Verlauf).
 * Garmin, TomTom Rider, Calimoto und Kurviger können beides lesen.
 */
export function buildGpx(title: string, stages: GpxStage[]) {
  const f = (n: number) => n.toFixed(6);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="Tourenplaner" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${esc(title)}</name></metadata>`,
  ];
  for (const s of stages) {
    for (const w of s.waypoints) lines.push(`  <wpt lat="${f(w.lat)}" lon="${f(w.lon)}"><name>${esc(w.name || coord(w))}</name></wpt>`);
  }
  for (const s of stages) {
    if (!s.waypoints.length) continue;
    lines.push(`  <rte><name>${esc(s.name)}</name>`);
    for (const w of s.waypoints) lines.push(`    <rtept lat="${f(w.lat)}" lon="${f(w.lon)}"><name>${esc(w.name || coord(w))}</name></rtept>`);
    lines.push(`  </rte>`);
  }
  for (const s of stages) {
    if (!s.track.length) continue;
    lines.push(`  <trk><name>${esc(s.name)}</name><trkseg>`);
    for (const p of s.track) lines.push(`    <trkpt lat="${f(p.lat)}" lon="${f(p.lon)}"/>`);
    lines.push(`  </trkseg></trk>`);
  }
  lines.push(`</gpx>`, "");
  return lines.join("\n");
}

/**
 * Freie Online-Dienste ohne API-Schlüssel:
 * - Routing: Valhalla (FOSSGIS-Server) mit Motorrad-Profil
 * - Ortssuche: Nominatim (OpenStreetMap) – nur auf Knopfdruck, keine Autovervollständigung
 * - Wetter: Open-Meteo (bis 16 Tage im Voraus, kostenlos nur nicht-kommerziell)
 *
 * Die Adressen sind in den Einstellungen änderbar; das Rust-Backend sendet einen eigenen
 * User-Agent, hält höchstens eine Anfrage pro Sekunde je Dienst ein und speichert Suchergebnisse zwischen.
 */
import { api } from "./api";
import { decodePolyline, encodePolyline, simplify } from "./geo";
import { DEFAULT_SERVICES } from "./defaults";
import type { LatLon, RouteOptions, ServiceSettings } from "./types";

const METEO = "https://api.open-meteo.com/v1/forecast";

let cfg: ServiceSettings = { ...DEFAULT_SERVICES };
const base = (u: string) => u.trim().replace(/\/+$/, "");

/** Wird beim Laden und Ändern der Einstellungen aufgerufen. */
export function configureServices(s: ServiceSettings) {
  cfg = s;
}

export const geocodingEnabled = () => cfg.geocoding;
export const weatherEnabled = () => cfg.weather;

export interface RouteResult {
  geometry: string;
  distanceKm: number;
  durationMin: number;
  /** Strecke/Zeit je Abschnitt zwischen zwei Wegpunkten */
  legs: { distanceKm: number; durationMin: number }[];
}

export async function routeMotorcycle(points: LatLon[], o: RouteOptions): Promise<RouteResult> {
  if (points.length < 2) throw new Error("Mindestens Start und Ziel nötig.");
  const body = {
    locations: points.map((p, i) => ({ lat: p.lat, lon: p.lon, type: i === 0 || i === points.length - 1 ? "break" : "break_through" })),
    costing: "motorcycle",
    costing_options: {
      motorcycle: {
        use_highways: o.useHighways,
        use_tolls: o.avoidTolls ? 0 : 0.5,
        use_ferry: o.avoidFerries ? 0 : 0.5,
        use_trails: 0,
      },
    },
    units: "kilometers",
    directions_type: "none",
  };
  const res = JSON.parse(await api.webRequest(`${base(cfg.routingUrl)}/route`, body));
  const trip = res.trip;
  if (!trip) throw new Error(res.error ?? "Keine Route gefunden.");
  const shape = trip.legs.flatMap((l: { shape: string }, i: number) => {
    const pts = decodePolyline(l.shape, 6);
    return i === 0 ? pts : pts.slice(1);
  });
  return {
    geometry: encodePolyline(simplify(shape, 0.00002)),
    distanceKm: trip.summary.length,
    durationMin: Math.round(trip.summary.time / 60),
    legs: trip.legs.map((l: { summary: { length: number; time: number } }) => ({ distanceKm: l.summary.length, durationMin: Math.round(l.summary.time / 60) })),
  };
}

export interface Place extends LatLon {
  name: string;
  label: string;
}

function shortName(r: { name?: string; display_name: string; address?: Record<string, string> }) {
  const a = r.address ?? {};
  const town = a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? "";
  const n = r.name || town || r.display_name.split(",")[0];
  return town && n !== town ? `${n}, ${town}` : n;
}

export async function searchPlaces(q: string): Promise<Place[]> {
  if (!cfg.geocoding) throw new Error("Die Ortssuche ist in den Einstellungen ausgeschaltet.");
  const url = `${base(cfg.geocodingUrl)}/search?format=jsonv2&addressdetails=1&limit=8&accept-language=de&q=${encodeURIComponent(q)}`;
  const list = JSON.parse(await api.webRequest(url));
  return list.map((r: { lat: string; lon: string; display_name: string; name?: string; address?: Record<string, string> }) => ({
    lat: Number(r.lat),
    lon: Number(r.lon),
    name: shortName(r),
    label: r.display_name,
  }));
}

export async function reverseGeocode(p: LatLon): Promise<string> {
  if (!cfg.geocoding) return "";
  try {
    const url = `${base(cfg.geocodingUrl)}/reverse?format=jsonv2&addressdetails=1&zoom=14&accept-language=de&lat=${p.lat}&lon=${p.lon}`;
    const r = JSON.parse(await api.webRequest(url));
    return r.display_name ? shortName(r) : "";
  } catch {
    return "";
  }
}

export interface DayWeather {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
  rainProb: number;
  rainMm: number;
  windMax: number;
}

/** Tageswetter für einen Ort; null, wenn das Datum außerhalb der Vorhersage liegt. */
export async function weatherFor(p: LatLon, date: string): Promise<DayWeather | null> {
  if (!cfg.weather) return null;
  const days = (new Date(`${date}T12:00:00`).getTime() - Date.now()) / 86_400_000;
  if (days < -1 || days > 15) return null;
  const url =
    `${METEO}?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}&timezone=auto&start_date=${date}&end_date=${date}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max`;
  const d = JSON.parse(await api.webRequest(url)).daily;
  if (!d?.time?.length) return null;
  return {
    date,
    code: d.weather_code[0],
    tMax: d.temperature_2m_max[0],
    tMin: d.temperature_2m_min[0],
    rainProb: d.precipitation_probability_max[0] ?? 0,
    rainMm: d.precipitation_sum[0] ?? 0,
    windMax: d.wind_speed_10m_max[0] ?? 0,
  };
}

/** WMO-Wettercode → Symbol und Text */
export function weatherLabel(code: number): [string, string] {
  if (code === 0) return ["☀️", "Sonnig"];
  if (code <= 2) return ["🌤", "Leicht bewölkt"];
  if (code === 3) return ["☁️", "Bedeckt"];
  if (code <= 48) return ["🌫", "Nebel"];
  if (code <= 57) return ["🌦", "Nieselregen"];
  if (code <= 67) return ["🌧", "Regen"];
  if (code <= 77) return ["🌨", "Schnee"];
  if (code <= 82) return ["🌧", "Regenschauer"];
  if (code <= 86) return ["🌨", "Schneeschauer"];
  return ["⛈", "Gewitter"];
}

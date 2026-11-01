import { useEffect, useState } from "react";
import { weatherFor, weatherLabel, type DayWeather } from "../lib/services";
import type { LatLon } from "../lib/types";
import { num } from "../lib/format";

const cache = new Map<string, Promise<DayWeather | null>>();

function load(p: LatLon, date: string) {
  const key = `${p.lat.toFixed(2)},${p.lon.toFixed(2)},${date}`;
  if (!cache.has(key)) cache.set(key, weatherFor(p, date).catch(() => null));
  return cache.get(key)!;
}

/** Wettervorhersage (Open-Meteo) – erscheint nur, wenn das Datum in den nächsten 16 Tagen liegt. */
export function Weather({ pos, date, full }: { pos?: LatLon; date: string; full?: boolean }) {
  const [w, setW] = useState<DayWeather | null>(null);
  useEffect(() => {
    setW(null);
    if (!pos || !date) return;
    let alive = true;
    load(pos, date).then((r) => alive && setW(r));
    return () => {
      alive = false;
    };
  }, [pos?.lat, pos?.lon, date]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!w) return null;
  const [icon, text] = weatherLabel(w.code);
  const title = `${text}, ${num(w.tMin, 0)}–${num(w.tMax, 0)} °C, Regen ${w.rainProb} % (${num(w.rainMm, 1)} mm), Wind bis ${num(w.windMax, 0)} km/h`;
  if (!full)
    return (
      <span className="weather" title={title}>
        {icon} {num(w.tMax, 0)}°
      </span>
    );
  return (
    <div className="weather full">
      <span className="weather-icon">{icon}</span>
      <div>
        <div>
          <strong>{text}</strong> · {num(w.tMin, 0)}–{num(w.tMax, 0)} °C
        </div>
        <div className="muted small">
          Regen {w.rainProb} % ({num(w.rainMm, 1)} mm) · Wind bis {num(w.windMax, 0)} km/h
        </div>
      </div>
    </div>
  );
}

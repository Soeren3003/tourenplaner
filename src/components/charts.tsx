import { useEffect, useRef, useState, type FocusEvent, type PointerEvent, type ReactNode } from "react";

/** Breite eines Containers beobachten, damit SVG-Diagramme mitwachsen. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Runde Achsenschritte: 1, 2, 2,5, 5 × 10^n */
function niceTicks(max: number, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Rechteck mit 4px abgerundetem Datenende oben, eckig an der Basislinie. */
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export interface Series {
  name: string;
  /** CSS-Farbe, z. B. var(--viz-1) */
  color: string;
}

interface Tip {
  x: number;
  y: number;
  content: ReactNode;
}

function Tooltip({ tip }: { tip: Tip | null }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.content}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  return (
    <div className="viz-legend">
      {series.map((s) => (
        <span key={s.name}>
          <i style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/**
 * Gestapelte Säulen, z. B. Auftragswert je Monat (bezahlt / offen).
 * Jede Säule ist Hover-Ziel über die ganze Bandbreite.
 */
export function StackedColumns({
  data,
  series,
  format,
  formatAxis = format,
  height = 220,
}: {
  data: { label: string; long: string; values: number[] }[];
  series: Series[];
  format: (n: number) => string;
  formatAxis?: (n: number) => string;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0));
  const ticks = niceTicks(Math.max(...totals, 0));
  const top = ticks[ticks.length - 1];
  const left = 52;
  const bottom = 24;
  const plotH = height - bottom - 8;
  const plotW = Math.max(0, width - left - 4);
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => 8 + plotH - (v / top) * plotH;
  const labelEvery = band < 34 ? Math.ceil(34 / band) : 1;

  const show = (i: number, e: PointerEvent | FocusEvent) => {
    setHover(i);
    const box = ref.current!.getBoundingClientRect();
    const px = "clientX" in e ? e.clientX - box.left : left + band * (i + 0.5);
    setTip({
      x: Math.min(Math.max(px, 70), width - 70),
      y: y(totals[i]) - 8,
      content: (
        <>
          <div className="viz-tip-head">{data[i].long}</div>
          {series.map((s, si) => (
            <div key={s.name} className="viz-tip-row">
              <i style={{ background: s.color }} />
              <strong>{format(data[i].values[si])}</strong>
              <span>{s.name}</span>
            </div>
          ))}
          {series.length > 1 && (
            <div className="viz-tip-row total">
              <strong>{format(totals[i])}</strong>
              <span>Gesamt</span>
            </div>
          )}
        </>
      ),
    });
  };
  const hide = () => {
    setHover(null);
    setTip(null);
  };

  return (
    <div className="viz" ref={ref} style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Säulendiagramm">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? "viz-base" : "viz-grid"} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="viz-axis">
                {formatAxis(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = left + band * (i + 0.5);
            let acc = 0;
            const last = d.values.reduce((li, v, vi) => (v > 0 ? vi : li), -1);
            return (
              <g
                key={d.label + i}
                className={`viz-col ${hover !== null && hover !== i ? "dim" : ""}`}
                tabIndex={0}
                onPointerMove={(e) => show(i, e)}
                onPointerLeave={hide}
                onFocus={(e) => show(i, e)}
                onBlur={hide}
              >
                <rect x={cx - band / 2} y={8} width={band} height={plotH} fill="transparent" />
                {d.values.map((v, si) => {
                  if (v <= 0) return null;
                  const y0 = y(acc);
                  acc += v;
                  const y1 = y(acc);
                  // 2px Flächenlücke zwischen gestapelten Segmenten
                  const gap = si > 0 && acc - v > 0 ? 2 : 0;
                  const h = Math.max(0, y0 - y1 - gap);
                  return si === last ? (
                    <path key={si} d={topRounded(cx - barW / 2, y1, barW, h)} fill={series[si].color} />
                  ) : (
                    <rect key={si} x={cx - barW / 2} y={y1} width={barW} height={h} fill={series[si].color} />
                  );
                })}
                {i % labelEvery === 0 && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="viz-axis">
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <Tooltip tip={tip} />
    </div>
  );
}

/** Horizontale Balken mit Wert am Balkenende – für Rangfolgen und Anteile. */
export function BarList({
  items,
  format,
  color = "var(--viz-1)",
  showShare = true,
}: {
  items: { label: string; value: number; hint?: string; onClick?: () => void }[];
  format: (n: number) => string;
  color?: string;
  showShare?: boolean;
}) {
  const max = Math.max(...items.map((i) => i.value), 0);
  const sum = items.reduce((s, i) => s + i.value, 0);
  return (
    <ul className="viz-bars">
      {items.map((it) => {
        const share = sum ? (it.value / sum) * 100 : 0;
        return (
          <li
            key={it.label}
            className={it.onClick ? "clickable" : ""}
            onClick={it.onClick}
            title={`${it.label}: ${format(it.value)}${showShare ? ` (${share.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %)` : ""}`}
          >
            <span className="viz-bar-label">
              {it.label}
              {it.hint && <span className="muted"> · {it.hint}</span>}
            </span>
            <span className="viz-bar-track">
              <span className="viz-bar" style={{ width: `${max ? Math.max((it.value / max) * 100, it.value > 0 ? 1.5 : 0) : 0}%`, background: color }} />
            </span>
            <span className="viz-bar-value">
              {format(it.value)}
              {showShare && <span className="muted"> {share.toLocaleString("de-DE", { maximumFractionDigits: 0 })} %</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Kleine Verlaufslinie für Kennzahl-Kacheln (eine Reihe, ohne Achsen). */
export function Sparkline({ values, color = "var(--viz-1)" }: { values: number[]; color?: string }) {
  const w = 96;
  const h = 28;
  if (values.length < 2) return null;
  const max = Math.max(...values, 0) || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (w - 6) + 3, h - 3 - (v / max) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} className="sparkline" aria-hidden>
      <path d={`${d}L${last[0]},${h}L3,${h}Z`} fill={color} opacity={0.1} />
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="var(--panel)" strokeWidth={2} />
    </svg>
  );
}

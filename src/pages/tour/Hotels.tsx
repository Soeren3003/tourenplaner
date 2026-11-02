import { useMemo, useState } from "react";
import { MemberPicker, MemberSelect } from "../../components/common";
import MapView, { type MapMarker } from "../../components/MapView";
import { Badge, Empty, Field, NumberInput } from "../../components/ui";
import { api, confirmDialog } from "../../lib/api";
import { HOTEL_STATUS, addDays, daysBetween, newHotel } from "../../lib/defaults";
import { date, money } from "../../lib/format";
import { decodePolyline } from "../../lib/geo";
import { reverseGeocode } from "../../lib/services";
import { useStore } from "../../lib/store";
import type { TourSummary } from "../../lib/summary";
import type { Hotel, HotelStatus, Tour } from "../../lib/types";
import { stageColor } from "./Overview";
import { PlaceSearch } from "./Stages";

export default function Hotels({ tour, sum }: { tour: Tour; sum: TourSummary }) {
  const store = useStore();
  const [sel, setSel] = useState(sum.hotels[0]?.id ?? "");
  const hotel = sum.hotels.find((h) => h.id === sel);

  // Nächte ohne (aktive) Unterkunft
  const nights = Math.max(0, Math.min(60, daysBetween(tour.startDate, tour.endDate)));
  const open = Array.from({ length: nights }, (_, i) => addDays(tour.startDate, i)).filter(
    (d) => !sum.hotels.some((h) => h.status !== "cancelled" && h.checkIn <= d && d < h.checkOut),
  );

  const add = (checkIn: string) => {
    const h = newHotel(tour.id, checkIn);
    // Etappenziel des Tages als Vorschlag für den Ort
    const end = sum.stages.filter((s) => s.date === checkIn).pop()?.waypoints.slice(-1)[0];
    if (end) {
      h.lat = end.lat;
      h.lon = end.lon;
      h.address = end.name;
    }
    store.save("hotels", h);
    setSel(h.id);
  };

  const total = sum.hotels.filter((h) => h.status !== "cancelled").reduce((a, h) => a + h.price, 0);

  return (
    <div className="master-detail wide-master">
      <aside className="master">
        <section className="card">
          <div className="card-head">
            <h2>Unterkünfte</h2>
            <button className="primary small" onClick={() => add(open[0] ?? tour.startDate)}>
              + Unterkunft
            </button>
          </div>
          {sum.hotels.length === 0 && <p className="muted small">Noch keine Unterkünfte.</p>}
          <ul className="pick-list">
            {sum.hotels.map((h) => (
              <li key={h.id} className={h.id === sel ? "active" : ""} onClick={() => setSel(h.id)}>
                <div className="grow">
                  <div className={h.status === "cancelled" ? "strike" : ""}>
                    {h.name || "Ohne Namen"} {h.garage && <span title="Garage / überdachter Stellplatz">🏍</span>}
                    {h.charging && <span title="Lademöglichkeit fürs E-Motorrad">🔌</span>}
                  </div>
                  <div className="muted small">
                    {date(h.checkIn)} · {daysBetween(h.checkIn, h.checkOut)} Nacht/Nächte
                  </div>
                </div>
                <div className="r">
                  <Badge color={HOTEL_STATUS[h.status].color}>{HOTEL_STATUS[h.status].label}</Badge>
                  <div className="small muted">{h.price ? money(h.price, tour.currency) : ""}</div>
                </div>
              </li>
            ))}
          </ul>
          {total > 0 && (
            <div className="stage-total small">
              <span>Summe</span>
              <span>{money(total, tour.currency)}</span>
            </div>
          )}
        </section>
        {open.length > 0 && (
          <section className="card">
            <h2>Noch ohne Unterkunft</h2>
            <ul className="plain">
              {open.map((d) => (
                <li key={d} className="row between">
                  <span>Nacht {date(d)}</span>
                  <button className="link small" onClick={() => add(d)}>
                    + anlegen
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
      {hotel ? <HotelEditor key={hotel.id} tour={tour} sum={sum} hotel={hotel} onDeleted={() => setSel("")} /> : <Empty>Unterkunft links auswählen oder anlegen.</Empty>}
    </div>
  );
}

function HotelEditor({ tour, sum, hotel, onDeleted }: { tour: Tour; sum: TourSummary; hotel: Hotel; onDeleted: () => void }) {
  const store = useStore();
  const [fit, setFit] = useState(hotel.id);
  const set = (patch: Partial<Hotel>) => store.save("hotels", { ...hotel, ...patch });
  const nights = Math.max(1, daysBetween(hotel.checkIn, hotel.checkOut));
  const people = (hotel.splitAmong.length || tour.memberIds.length) || 1;

  const { lines, markers } = useMemo(() => {
    const lines = sum.stages
      .filter((s) => s.geometry && (s.date === hotel.checkIn || s.date === hotel.checkOut))
      .map((s) => ({ id: s.id, points: decodePolyline(s.geometry), color: stageColor(tour, s), weight: 4 }));
    const markers: MapMarker[] =
      hotel.lat !== null && hotel.lon !== null
        ? [
            {
              id: hotel.id,
              pos: { lat: hotel.lat, lon: hotel.lon },
              label: "🛏",
              color: "#1f2937",
              shape: "square",
              draggable: true,
              title: hotel.name,
              onDragEnd: (p) => set({ lat: p.lat, lon: p.lon }),
            },
          ]
        : [];
    return { lines, markers };
  }, [hotel, sum.stages, tour]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async () => {
    if (!(await confirmDialog(`Unterkunft „${hotel.name || "ohne Namen"}“ löschen?`))) return;
    await store.remove("hotels", hotel.id);
    onDeleted();
  };

  return (
    <div className="detail-col">
      <section className="card">
        <div className="card-head">
          <h2>{hotel.name || "Neue Unterkunft"}</h2>
          <div className="row">
            <select className="small" value={hotel.status} onChange={(e) => set({ status: e.target.value as HotelStatus })}>
              {Object.entries(HOTEL_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <button className="ghost small danger" onClick={remove}>
              Löschen
            </button>
          </div>
        </div>
        <div className="form-grid">
          <Field label="Name">
            <input value={hotel.name} autoFocus={!hotel.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Adresse">
            <input value={hotel.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Anreise">
            <input
              type="date"
              value={hotel.checkIn}
              onChange={(e) => {
                const v = e.target.value;
                if (v) set({ checkIn: v, checkOut: addDays(v, Math.max(1, daysBetween(hotel.checkIn, hotel.checkOut))) });
              }}
            />
          </Field>
          <Field label="Abreise">
            <input type="date" value={hotel.checkOut} min={addDays(hotel.checkIn, 1)} onChange={(e) => e.target.value && set({ checkOut: e.target.value })} />
          </Field>
          <Field label="Preis gesamt (Gruppe)" hint={hotel.price ? `${money(hotel.price / people / nights, tour.currency)} pro Person und Nacht` : undefined}>
            <NumberInput value={hotel.price} suffix={tour.currency} onChange={(v) => set({ price: v ?? 0 })} />
          </Field>
          <Field label="Bezahlt von" hint="Wird in der Kostenaufteilung berücksichtigt.">
            <MemberSelect members={sum.members} value={hotel.paidBy} onChange={(paidBy) => set({ paidBy })} emptyLabel="Jeder zahlt selbst / offen" />
          </Field>
          <Field label="Aufteilen auf" wide>
            <MemberPicker members={sum.members} selected={hotel.splitAmong} onChange={(splitAmong) => set({ splitAmong })} allLabel="Alle" />
          </Field>
          <div className="row">
            <label className="check">
              <input type="checkbox" checked={hotel.garage} onChange={(e) => set({ garage: e.target.checked })} />
              Garage / sicherer Stellplatz fürs Motorrad
            </label>
            {sum.members.some((m) => m.drive === "electric") && (
              <label className="check">
                <input type="checkbox" checked={!!hotel.charging} onChange={(e) => set({ charging: e.target.checked })} />
                Lademöglichkeit fürs E-Motorrad
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={hotel.breakfast} onChange={(e) => set({ breakfast: e.target.checked })} />
              Frühstück inklusive
            </label>
          </div>
          <Field label="Telefon">
            <input value={hotel.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Buchungsnummer">
            <input value={hotel.confirmation} onChange={(e) => set({ confirmation: e.target.value })} />
          </Field>
          <Field label="Webseite / Buchungslink" wide>
            <div className="row">
              <input className="grow" value={hotel.url} placeholder="https://…" onChange={(e) => set({ url: e.target.value })} />
              <button className="ghost small" disabled={!/^https?:\/\//.test(hotel.url)} onClick={() => api.openUrl(hotel.url)}>
                Öffnen
              </button>
            </div>
          </Field>
          <Field label="Notizen" wide>
            <textarea rows={3} value={hotel.notes} placeholder="Stornofrist, Check-in-Zeiten, Abendessen …" onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <h2>Lage</h2>
          <span className="muted small">Suchen, auf die Karte klicken oder den Marker ziehen</span>
        </div>
        <PlaceSearch
          placeholder="Hotel oder Adresse suchen …"
          onPick={(p) => {
            set({ lat: p.lat, lon: p.lon, address: hotel.address || p.label, name: hotel.name || p.name });
            setFit(`${p.lat},${p.lon}`);
          }}
        />
        <MapView
          lines={lines}
          markers={markers}
          fitKey={fit}
          className="medium"
          onMapClick={async (p) => {
            set({ lat: p.lat, lon: p.lon });
            if (!hotel.address) {
              const n = await reverseGeocode(p);
              if (n) store.save("hotels", { ...hotel, lat: p.lat, lon: p.lon, address: n });
            }
          }}
        />
      </section>
    </div>
  );
}

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { saveAs } from "./api";
import { arrival, balances, settle } from "./calc";
import { HOTEL_STATUS, daysBetween } from "./defaults";
import { date, duration, money, num, safeFileName } from "./format";
import { buildGpx, decodePolyline } from "./geo";
import type { TourSummary } from "./summary";
import type { Stage, Tour } from "./types";

/** Tag 1 = Starttag der Tour */
export function dayNo(tour: Tour, s: Stage) {
  return daysBetween(tour.startDate, s.date) + 1;
}

export function stageLabel(tour: Tour, s: Stage) {
  return `Tag ${dayNo(tour, s)}${s.title ? ` – ${s.title}` : ""}`;
}

export async function exportGpx(tour: Tour, stages: Stage[], title = tour.name) {
  const gpx = buildGpx(
    title,
    stages.map((stage) => ({
      name: stageLabel(tour, stage),
      waypoints: stage.waypoints,
      track: stage.geometry ? decodePolyline(stage.geometry) : [],
    })),
  );
  return saveAs(`${safeFileName(title)}.gpx`, new TextEncoder().encode(gpx), "application/gpx+xml");
}

/** Roadbook zum Ausdrucken oder fürs Handy: Etappen, Unterkünfte, Kontakte, Abrechnung. */
export async function exportRoadbook(tour: Tour, sum: TourSummary) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cur = tour.currency;
  const name = (id: string) => sum.members.find((m) => m.id === id)?.name ?? "?";
  let y = 18;
  doc.setFontSize(18);
  doc.text(tour.name, 14, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(
    `${tour.region ? `${tour.region} · ` : ""}${date(tour.startDate)} – ${date(tour.endDate)} · ${num(sum.stats.km, 0)} km · ${duration(sum.stats.minutes)} h Fahrzeit`,
    14,
    y,
  );
  doc.setTextColor(0);
  y += 6;

  const table = (title: string, head: string[], body: (string | number)[][]) => {
    if (!body.length) return;
    doc.setFontSize(12);
    doc.text(title, 14, y + 6);
    autoTable(doc, {
      startY: y + 9,
      head: [head],
      body,
      styles: { fontSize: 9, cellPadding: 1.8 },
      headStyles: { fillColor: [31, 138, 106] },
      margin: { left: 14, right: 14 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  };

  const hotelOn = (d: string) => sum.hotels.find((h) => h.checkIn === d && h.status !== "cancelled");
  // Spalte „Wer“ nur, wenn nicht immer alle mitfahren
  const partial = sum.stages.some((s) => s.memberIds?.length);
  const who = (s: Stage) => (s.memberIds?.length ? sum.ridersOf(s).map((m) => m.name).join(", ") : "alle");
  table(
    "Etappen",
    ["Tag", "Datum", "Strecke", "km", "Fahrzeit", "Abfahrt – Ankunft", "Übernachtung", ...(partial ? ["Wer"] : [])],
    sum.stages.map((s) => [
      String(dayNo(tour, s)),
      date(s.date),
      s.title || s.waypoints.map((w) => w.name).filter(Boolean).join(" – "),
      num(s.distanceKm, 0),
      duration(s.durationMin),
      `${s.departure} – ${arrival(s, sum.stageEnergy.get(s.id)?.chargeMinutes)}`,
      hotelOn(s.date)?.name ?? "",
      ...(partial ? [who(s)] : []),
    ]),
  );

  table(
    "Unterkünfte",
    ["Datum", "Unterkunft", "Adresse", "Telefon", "Status", "Buchungsnr."],
    sum.hotels
      .filter((h) => h.status !== "cancelled")
      .map((h) => [`${date(h.checkIn)} – ${date(h.checkOut)}`, `${h.name}${h.garage ? " (Garage)" : ""}${h.charging ? " (Laden)" : ""}`, h.address, h.phone, HOTEL_STATUS[h.status].label, h.confirmation]),
  );

  for (const s of sum.stages) {
    if (s.waypoints.length < 2) continue;
    table(
      `${stageLabel(tour, s)} (${date(s.date)})`,
      ["#", "Wegpunkt", "Koordinaten"],
      s.waypoints.map((w, j) => [String(j + 1), w.name, `${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`]),
    );
  }

  table(
    "Gruppe",
    ["Name", "Motorrad", "Telefon", "Notfallkontakt"],
    sum.members.map((m) => [m.name, m.bike, m.phone, m.emergencyContact]),
  );

  const transfers = settle(balances(tour.memberIds, sum.items));
  if (sum.items.length) {
    table(
      `Kosten (gesamt ${money(sum.costs, cur)})`,
      ["Wer", "zahlt an", "Betrag"],
      transfers.length ? transfers.map((t) => [name(t.from), name(t.to), money(t.amount, cur)]) : [["–", "Alles ausgeglichen", ""]],
    );
  }

  const bytes = new Uint8Array(doc.output("arraybuffer"));
  return saveAs(`Roadbook ${safeFileName(tour.name)}.pdf`, bytes, "application/pdf");
}

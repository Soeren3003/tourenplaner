import { costItems, energyInfo, sortStages, tourStats, type EnergyInfo } from "./calc";
import type { Expense, Hotel, Member, Settings, Stage, Tour } from "./types";

interface Data {
  stages: Stage[];
  hotels: Hotel[];
  expenses: Expense[];
  members: Member[];
  settings: Settings;
}

/** Kennzahlen einer Tour für Listen, Übersicht und Statistik. */
export function summarize(tour: Tour, d: Data) {
  const stages = sortStages(d.stages.filter((s) => s.tourId === tour.id));
  const hotels = d.hotels.filter((h) => h.tourId === tour.id).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const members = d.members.filter((m) => tour.memberIds.includes(m.id));
  const items = costItems(tour, d.expenses, d.hotels);
  const stats = tourStats(stages);
  const costs = items.reduce((a, i) => a + i.amount, 0);
  const prices = { fuel: tour.fuelPrice, electricity: tour.electricityPrice ?? d.settings.defaultElectricityPrice };
  // Stopps je Etappe (über Nacht wird voll getankt bzw. geladen), Verbrauch über die ganze Tour
  const stageEnergy = new Map<string, EnergyInfo | null>(stages.map((s) => [s.id, energyInfo(s.distanceKm, members, d.settings.tankReserve, prices)]));
  const energy = energyInfo(stats.km, members, d.settings.tankReserve, prices);
  const stopsOf = (k: "fuel" | "electric") => [...stageEnergy.values()].reduce((a, e) => a + (e?.[k]?.stops ?? 0), 0);
  const hasFuelExpenses = items.some((i) => i.category === "fuel");
  const hasChargingExpenses = items.some((i) => i.category === "charging");
  const people = Math.max(1, members.length);
  // Solange kein Sprit bzw. Strom erfasst ist, fließt die Schätzung in die Kosten pro Person ein.
  const energyEstimate = (hasFuelExpenses ? 0 : (energy?.fuel?.cost ?? 0)) + (hasChargingExpenses ? 0 : (energy?.electric?.cost ?? 0));
  const estimate = costs + energyEstimate;
  return {
    stages,
    hotels,
    members,
    items,
    stats,
    costs,
    energy,
    stageEnergy,
    fuelStops: stopsOf("fuel"),
    chargeStops: stopsOf("electric"),
    hasFuelExpenses,
    hasChargingExpenses,
    energyEstimate,
    perPerson: estimate / people,
    nights: hotels.filter((h) => h.status !== "cancelled").length,
  };
}

export type TourSummary = ReturnType<typeof summarize>;

import { costItems, energyInfo, sortStages, stageKm, stageRiders, tourStats, type EnergyInfo } from "./calc";
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
  const ridersOf = (s: Stage) => stageRiders(s, members);
  // Stopps je Etappe mit den Mitfahrern dieser Etappe (über Nacht wird voll getankt bzw. geladen)
  const stageEnergy = new Map<string, EnergyInfo | null>(stages.map((s) => [s.id, energyInfo(s.distanceKm, ridersOf(s), d.settings.tankReserve, prices)]));
  const stopsOf = (k: "fuel" | "electric") => [...stageEnergy.values()].reduce((a, e) => a + (e?.[k]?.stops ?? 0), 0);
  // Verbrauch: Summe über alle Etappen, jeweils nur für die Motorräder, die mitfahren (gefahrene km, sonst geplante)
  const total = (k: "fuel" | "electric") => {
    let amount = 0;
    let cost = 0;
    let any = false;
    for (const s of stages) {
      const e = energyInfo(stageKm(s), ridersOf(s), d.settings.tankReserve, prices)?.[k];
      if (!e) continue;
      any = true;
      amount += e.amount;
      cost += e.cost;
    }
    return any ? { amount: Math.round(amount * 10) / 10, cost: Math.round(cost * 100) / 100 } : null;
  };
  const energy = { fuel: total("fuel"), electric: total("electric") };
  /** gefahrene km eines Mitfahrers auf dieser Tour (nur Etappen, die er mitgefahren ist) */
  const memberKm = (id: string, onlyRidden = true) =>
    stages.filter((s) => (!onlyRidden || s.ridden) && ridersOf(s).some((m) => m.id === id)).reduce((a, s) => a + stageKm(s), 0);
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
    ridersOf,
    memberKm,
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

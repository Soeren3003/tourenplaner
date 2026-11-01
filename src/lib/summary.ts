import { costItems, fuelInfo, sortStages, tourStats } from "./calc";
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
  const fuel = fuelInfo(stats.km, members, d.settings.tankReserve, tour.fuelPrice);
  const hasFuelExpenses = items.some((i) => i.category === "fuel");
  const people = Math.max(1, members.length);
  // Solange kein Sprit erfasst ist, fließt die Schätzung in die Kosten pro Person ein.
  const estimate = costs + (hasFuelExpenses ? 0 : (fuel?.cost ?? 0));
  return {
    stages,
    hotels,
    members,
    items,
    stats,
    costs,
    fuel,
    hasFuelExpenses,
    perPerson: estimate / people,
    nights: hotels.filter((h) => h.status !== "cancelled").length,
  };
}

export type TourSummary = ReturnType<typeof summarize>;

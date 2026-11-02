import type { Drive, Expense, ExpenseCategory, Hotel, Member, Stage, Tour } from "./types";

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Kosten ----------

export interface CostItem {
  id: string;
  source: "expense" | "hotel";
  date: string;
  title: string;
  category: ExpenseCategory;
  /** in Tourwährung */
  amount: number;
  /** leer = jeder zahlt seinen Anteil selbst */
  paidBy: string;
  splitAmong: string[];
}

export function expenseAmount(e: Expense) {
  return e.amount * (e.currency === "" ? 1 : e.rate || 1);
}

export function costItems(tour: Tour, expenses: Expense[], hotels: Hotel[]): CostItem[] {
  const split = (ids: string[]) => {
    const valid = ids.filter((id) => tour.memberIds.includes(id));
    return valid.length ? valid : tour.memberIds;
  };
  const items: CostItem[] = [
    ...expenses
      .filter((e) => e.tourId === tour.id)
      .map((e) => ({
        id: e.id,
        source: "expense" as const,
        date: e.date,
        title: e.title,
        category: e.category,
        amount: expenseAmount(e),
        paidBy: e.paidBy,
        splitAmong: split(e.splitAmong),
      })),
    ...hotels
      .filter((h) => h.tourId === tour.id && h.status !== "cancelled" && h.price > 0)
      .map((h) => ({
        id: h.id,
        source: "hotel" as const,
        date: h.checkIn,
        title: h.name || "Unterkunft",
        category: "hotel" as const,
        amount: h.price,
        paidBy: h.paidBy,
        splitAmong: split(h.splitAmong),
      })),
  ];
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export interface Balance {
  memberId: string;
  /** tatsächlich ausgelegt */
  paid: number;
  /** eigener Anteil an allen Kosten */
  share: number;
  /** > 0: bekommt Geld, < 0: muss zahlen */
  balance: number;
}

export function balances(memberIds: string[], items: CostItem[]): Balance[] {
  const map = new Map(memberIds.map((id) => [id, { memberId: id, paid: 0, share: 0, balance: 0 }]));
  for (const it of items) {
    if (!it.splitAmong.length) continue;
    const part = it.amount / it.splitAmong.length;
    for (const id of it.splitAmong) {
      const b = map.get(id);
      if (!b) continue;
      b.share += part;
      // Zahlt jeder selbst, ist der Anteil zugleich die eigene Zahlung.
      if (!it.paidBy) b.paid += part;
    }
    if (it.paidBy) {
      const payer = map.get(it.paidBy);
      if (payer) payer.paid += it.amount;
    }
  }
  return [...map.values()].map((b) => ({ ...b, paid: round2(b.paid), share: round2(b.share), balance: round2(b.paid - b.share) }));
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

/** Möglichst wenige Überweisungen: größter Schuldner zahlt an größten Gläubiger. */
export function settle(bal: Balance[]): Transfer[] {
  const debtors = bal.filter((b) => b.balance < -0.005).map((b) => ({ id: b.memberId, v: -b.balance }));
  const creditors = bal.filter((b) => b.balance > 0.005).map((b) => ({ id: b.memberId, v: b.balance }));
  const out: Transfer[] = [];
  debtors.sort((a, b) => b.v - a.v);
  creditors.sort((a, b) => b.v - a.v);
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].v, creditors[j].v);
    if (amount >= 0.01) out.push({ from: debtors[i].id, to: creditors[j].id, amount: round2(amount) });
    debtors[i].v -= amount;
    creditors[j].v -= amount;
    if (debtors[i].v < 0.005) i++;
    if (creditors[j].v < 0.005) j++;
  }
  return out;
}

export function byCategory(items: CostItem[]) {
  const m = new Map<ExpenseCategory, number>();
  for (const it of items) m.set(it.category, (m.get(it.category) ?? 0) + it.amount);
  return [...m.entries()].map(([category, amount]) => ({ category, amount: round2(amount) })).sort((a, b) => b.amount - a.amount);
}

// ---------- Etappen ----------

export function sortStages(stages: Stage[]) {
  return stages.slice().sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.createdAt.localeCompare(b.createdAt));
}

/** gefahrene Werte, sonst geplante */
export const stageKm = (s: Stage) => s.actualKm ?? s.distanceKm;
export const stageMin = (s: Stage) => s.actualMin ?? s.durationMin;

export function toMinutes(hhmm: string) {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

export function clock(minutes: number) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** voraussichtliche Ankunft = Abfahrt + Fahrzeit + Pausen (+ Zeit an Ladesäulen) */
export function arrival(s: Stage, extraMinutes = 0) {
  return clock(toMinutes(s.departure) + s.durationMin + s.pauseMinutes + extraMinutes);
}

export interface EnergyGroup {
  drive: Drive;
  /** kleinste nutzbare Reichweite (mit Reserve) unter den Motorrädern dieses Antriebs */
  rangeKm: number;
  limitedBy: string;
  /** Stopps unterwegs; gestartet wird mit vollem Tank bzw. Akku */
  stops: number;
  /** ungefähre Kilometer der Stopps ab Etappenstart */
  stopKm: number[];
  /** Liter bzw. kWh für alle Motorräder dieses Antriebs zusammen */
  amount: number;
  cost: number;
}

export interface EnergyInfo {
  fuel: EnergyGroup | null;
  electric: EnergyGroup | null;
  cost: number;
  /** zusätzliche Standzeit an Ladesäulen (Tanken steckt in den normalen Pausen) */
  chargeMinutes: number;
}

function energyGroup(drive: Drive, km: number, members: Member[], reserve: number, price: number): EnergyGroup | null {
  const group = members.filter((m) => (m.drive ?? "fuel") === drive);
  const withRange = group.filter((m) => m.tankRangeKm > 0);
  if (!withRange.length || km <= 0) return null;
  const min = withRange.reduce((a, b) => (b.tankRangeKm < a.tankRangeKm ? b : a));
  const rangeKm = Math.max(1, Math.round(min.tankRangeKm * reserve));
  const stops = Math.max(0, Math.ceil(km / rangeKm) - 1);
  const amount = group.reduce((sum, m) => sum + (km * (m.consumption || 0)) / 100, 0);
  return {
    drive,
    rangeKm,
    limitedBy: min.name,
    stops,
    stopKm: Array.from({ length: stops }, (_, i) => (i + 1) * rangeKm),
    amount: Math.round(amount * 10) / 10,
    cost: round2(amount * price),
  };
}

/**
 * Tank- und Ladestopps, Verbrauch und Energiekosten für eine Strecke.
 * Verbrenner und Elektro werden getrennt gerechnet; die Gruppe hält an,
 * sobald das Motorrad mit der kleinsten Reichweite es braucht.
 */
export function energyInfo(km: number, members: Member[], reserve: number, prices: { fuel: number; electricity: number }): EnergyInfo | null {
  const fuel = energyGroup("fuel", km, members, reserve, prices.fuel);
  const electric = energyGroup("electric", km, members, reserve, prices.electricity);
  if (!fuel && !electric) return null;
  const perStop = Math.max(0, ...members.filter((m) => m.drive === "electric").map((m) => m.chargeMinutes || 0));
  return {
    fuel,
    electric,
    cost: round2((fuel?.cost ?? 0) + (electric?.cost ?? 0)),
    chargeMinutes: (electric?.stops ?? 0) * perStop,
  };
}

export interface TourStats {
  stages: number;
  days: number;
  plannedKm: number;
  km: number;
  minutes: number;
  ridden: number;
  longestKm: number;
  avgKmPerDay: number;
  avgSpeed: number;
}

export function tourStats(stages: Stage[]): TourStats {
  const days = new Set(stages.map((s) => s.date)).size;
  const km = stages.reduce((a, s) => a + stageKm(s), 0);
  const minutes = stages.reduce((a, s) => a + stageMin(s), 0);
  const perDay = new Map<string, number>();
  for (const s of stages) perDay.set(s.date, (perDay.get(s.date) ?? 0) + stageKm(s));
  return {
    stages: stages.length,
    days,
    plannedKm: Math.round(stages.reduce((a, s) => a + s.distanceKm, 0)),
    km: Math.round(km),
    minutes,
    ridden: stages.filter((s) => s.ridden).length,
    longestKm: Math.round(Math.max(0, ...perDay.values())),
    avgKmPerDay: days ? Math.round(km / days) : 0,
    avgSpeed: minutes ? Math.round(km / (minutes / 60)) : 0,
  };
}

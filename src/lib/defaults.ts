import type { Expense, ExpenseCategory, Hotel, HotelStatus, Member, Settings, Stage, Tour, TourStatus } from "./types";

export const uid = () => crypto.randomUUID().replace(/-/g, "").slice(0, 16);
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000);
}

export const TOUR_STATUS: Record<TourStatus, { label: string; color: string }> = {
  idea: { label: "Idee", color: "gray" },
  planning: { label: "In Planung", color: "blue" },
  booked: { label: "Gebucht", color: "green" },
  done: { label: "Gefahren", color: "purple" },
};

export const HOTEL_STATUS: Record<HotelStatus, { label: string; color: string }> = {
  idea: { label: "Idee", color: "gray" },
  requested: { label: "Angefragt", color: "yellow" },
  booked: { label: "Gebucht", color: "green" },
  cancelled: { label: "Storniert", color: "red" },
};

export const CATEGORIES: Record<ExpenseCategory, { label: string; icon: string }> = {
  fuel: { label: "Sprit", icon: "⛽" },
  charging: { label: "Laden (Strom)", icon: "🔌" },
  food: { label: "Essen & Trinken", icon: "🍽" },
  hotel: { label: "Unterkunft", icon: "🛏" },
  toll: { label: "Maut & Vignette", icon: "🛣" },
  ferry: { label: "Fähre", icon: "⛴" },
  fee: { label: "Eintritt & Gebühren", icon: "🎟" },
  repair: { label: "Werkstatt & Teile", icon: "🔧" },
  other: { label: "Sonstiges", icon: "•" },
};

/** Farben für Mitfahrer und Etappen – gut unterscheidbar auf der Karte. */
export const PALETTE = ["#2a78d6", "#eb6834", "#1f9d6b", "#9b51e0", "#d6336c", "#c99a06", "#0f8fa8", "#6b7280"];

export const CURRENCIES = ["EUR", "CHF", "GBP", "NOK", "SEK", "DKK", "CZK", "PLN", "HUF", "HRK", "RON", "BGN", "ISK", "TRY", "USD"];

export const DEFAULT_CHECKLIST = [
  "Führerschein & Fahrzeugschein",
  "Personalausweis / Reisepass",
  "Grüne Versicherungskarte",
  "Auslandskrankenversicherung",
  "Vignetten / Mautboxen geprüft",
  "Reifen & Profil geprüft",
  "Kette gespannt & geschmiert",
  "Ölstand geprüft",
  "Bordwerkzeug & Reifenpannenset",
  "Erste-Hilfe-Set & Warnweste",
  "Regenkombi",
  "Navi-Halterung & Ladekabel",
  "Routen auf Navi übertragen",
  "Intercom geladen & gekoppelt",
  "Bargeld in Landeswährung",
];

export function defaultSettings(): Settings {
  return {
    id: "settings",
    updatedAt: now(),
    defaultCurrency: "EUR",
    defaultFuelPrice: 1.85,
    defaultElectricityPrice: 0.59,
    defaultRouteOptions: { useHighways: 0.1, avoidTolls: true, avoidFerries: false },
    defaultDeparture: "09:00",
    defaultPauseMinutes: 90,
    tankReserve: 0.8,
    checklistTemplate: DEFAULT_CHECKLIST,
  };
}

export function migrateSettings(s: Partial<Settings>): Settings {
  const d = defaultSettings();
  return { ...d, ...s, defaultRouteOptions: { ...d.defaultRouteOptions, ...s.defaultRouteOptions } } as Settings;
}

/** Ältere Datensätze (vor 1.2.0) kennen nur Verbrenner. */
export function migrateMember(m: Partial<Member> & { id: string }): Member {
  return { drive: "fuel", chargeMinutes: 30, ...m } as Member;
}

export function migrateTour(t: Partial<Tour> & { id: string }, s: Settings): Tour {
  return { electricityPrice: s.defaultElectricityPrice, ...t } as Tour;
}

/** Typische Werte als Vorschlag beim Wechsel des Antriebs */
export const DRIVE_DEFAULTS: Record<"fuel" | "electric", { tankRangeKm: number; consumption: number }> = {
  fuel: { tankRangeKm: 300, consumption: 5 },
  electric: { tankRangeKm: 180, consumption: 9 },
};

const stamp = () => ({ id: uid(), createdAt: now(), updatedAt: now() });

export function newMember(index: number): Member {
  return {
    ...stamp(),
    name: "",
    bike: "",
    drive: "fuel",
    tankRangeKm: 300,
    consumption: 5,
    chargeMinutes: 30,
    phone: "",
    emergencyContact: "",
    color: PALETTE[index % PALETTE.length],
    notes: "",
  };
}

export function newTour(s: Settings, memberIds: string[]): Tour {
  const start = addDays(today(), 60);
  return {
    ...stamp(),
    name: "Neue Tour",
    region: "",
    startDate: start,
    endDate: addDays(start, 4),
    status: "idea",
    memberIds,
    currency: s.defaultCurrency,
    fuelPrice: s.defaultFuelPrice,
    electricityPrice: s.defaultElectricityPrice,
    notes: "",
    checklist: s.checklistTemplate.map((text) => ({ id: uid(), text, done: false, assignee: "" })),
  };
}

export function newStage(s: Settings, tourId: string, date: string, order = 0): Stage {
  return {
    ...stamp(),
    tourId,
    date,
    order,
    memberIds: [],
    title: "",
    departure: s.defaultDeparture,
    pauseMinutes: s.defaultPauseMinutes,
    waypoints: [],
    options: { ...s.defaultRouteOptions },
    source: "routing",
    geometry: "",
    distanceKm: 0,
    durationMin: 0,
    legs: [],
    actualKm: null,
    actualMin: null,
    ridden: false,
    notes: "",
  };
}

export function newHotel(tourId: string, checkIn: string): Hotel {
  return {
    ...stamp(),
    tourId,
    name: "",
    address: "",
    lat: null,
    lon: null,
    checkIn,
    checkOut: addDays(checkIn, 1),
    status: "idea",
    price: 0,
    paidBy: "",
    splitAmong: [],
    garage: false,
    charging: false,
    breakfast: true,
    phone: "",
    url: "",
    confirmation: "",
    notes: "",
  };
}

export function newExpense(tour: Tour, paidBy: string, date: string): Expense {
  return {
    ...stamp(),
    tourId: tour.id,
    date,
    title: "",
    category: "fuel",
    amount: 0,
    currency: tour.currency,
    rate: 1,
    paidBy,
    splitAmong: [],
    notes: "",
  };
}

/**
 * Erfundene Beispieldaten für Screenshots und zum Ausprobieren.
 * Nur in der Browser-Vorschau: http://localhost:1420/?demo (überschreibt die Vorschau-Daten im localStorage).
 * Alle Namen und Telefonnummern sind ausgedacht.
 */
import { DEFAULT_CHECKLIST, addDays } from "./defaults";

const now = "2027-01-15T10:00:00.000Z";
const base = { createdAt: now, updatedAt: now };
const START = "2027-06-17";
const d = (n: number) => addDays(START, n);
const opt = { useHighways: 0.1, avoidTolls: true, avoidFerries: false };

const members = [
  { id: "alex", name: "Alex", bike: "BMW R 1300 GS", drive: "fuel", tankRangeKm: 380, consumption: 5.2, chargeMinutes: 30, color: "#2a78d6" },
  { id: "bea", name: "Bea", bike: "Triumph Tiger 900", drive: "fuel", tankRangeKm: 330, consumption: 5.4, chargeMinutes: 30, color: "#eb6834" },
  { id: "chris", name: "Chris", bike: "Yamaha Ténéré 700", drive: "fuel", tankRangeKm: 360, consumption: 4.6, chargeMinutes: 30, color: "#1f9d6b" },
  { id: "dani", name: "Dani", bike: "Zero DSR/X", drive: "electric", tankRangeKm: 200, consumption: 9.5, chargeMinutes: 40, color: "#9b51e0" },
].map((m) => ({ ...base, phone: "+49 170 0000000", emergencyContact: "", notes: "", ...m }));

const tour = {
  ...base,
  id: "demo-tour",
  name: "Alpenpässe 2027",
  region: "Tirol & Südtirol",
  startDate: START,
  endDate: d(3),
  status: "booked",
  memberIds: members.map((m) => m.id),
  currency: "EUR",
  fuelPrice: 1.89,
  electricityPrice: 0.59,
  notes: "Treffpunkt Tag 2: 9:00 bei Alex in Imst.",
  checklist: DEFAULT_CHECKLIST.map((text, i) => ({ id: `c${i}`, text, done: i < 9, assignee: i === 4 ? "alex" : "" })),
};

type W = [string, number, number];
const stage = (id: string, n: number, title: string, wps: W[], memberIds: string[] = [], extra = {}) => ({
  ...base,
  id,
  tourId: tour.id,
  date: d(n),
  order: 0,
  memberIds,
  title,
  departure: "09:00",
  pauseMinutes: 90,
  waypoints: wps.map(([name, lat, lon], i) => ({ id: `${id}-${i}`, name, lat, lon })),
  options: opt,
  source: "routing",
  geometry: "",
  distanceKm: 0,
  durationMin: 0,
  legs: [],
  actualKm: null,
  actualMin: null,
  ridden: false,
  notes: "",
  ...extra,
});

const stages = [
  stage("s1", 0, "Anreise zu Alex nach Imst", [["Füssen", 47.5696, 10.7004], ["Plansee", 47.4745, 10.8263], ["Imst", 47.245, 10.739]], ["bea", "chris"]),
  stage("s2", 1, "Über das Timmelsjoch nach Meran", [["Imst", 47.245, 10.739], ["Sölden", 46.9655, 11.0076], ["Timmelsjoch", 46.9063, 11.0973], ["Meran", 46.6713, 11.1594]]),
  stage("s3", 2, "Stilfser Joch und Umbrail", [["Meran", 46.6713, 11.1594], ["Prad am Stilfser Joch", 46.6195, 10.5917], ["Stilfser Joch", 46.5286, 10.4528], ["Bormio", 46.4669, 10.3703]]),
  stage("s4", 3, "Rückreise über den Reschenpass", [["Bormio", 46.4669, 10.3703], ["Reschenpass", 46.8333, 10.5167], ["Füssen", 47.5696, 10.7004]], ["bea", "chris"]),
];

const hotel = (id: string, n: number, name: string, address: string, lat: number, lon: number, price: number, paidBy: string, extra = {}) => ({
  ...base,
  id,
  tourId: tour.id,
  name,
  address,
  lat,
  lon,
  checkIn: d(n),
  checkOut: d(n + 1),
  status: "booked",
  price,
  paidBy,
  splitAmong: [],
  garage: true,
  charging: false,
  breakfast: true,
  phone: "",
  url: "",
  confirmation: `DEMO-${n + 1}`,
  notes: "",
  ...extra,
});

const hotels = [
  hotel("h1", 0, "Gasthof Zum Biker", "Imst", 47.2458, 10.7402, 0, "", { splitAmong: ["bea", "chris"], notes: "Bea und Chris übernachten bei Alex." }),
  hotel("h2", 1, "Hotel Passblick", "Meran", 46.6702, 11.1621, 440, "alex", { charging: true }),
  hotel("h3", 2, "Albergo Stelvio", "Bormio", 46.4682, 10.3721, 396, "bea"),
];

const expense = (id: string, n: number, title: string, category: string, amount: number, paidBy: string, splitAmong: string[] = [], extra = {}) => ({
  ...base,
  id,
  tourId: tour.id,
  date: d(n),
  title,
  category,
  amount,
  currency: "EUR",
  rate: 1,
  paidBy,
  splitAmong,
  notes: "",
  ...extra,
});

const expenses = [
  expense("e1", 1, "Timmelsjoch Maut", "toll", 72, "chris"),
  expense("e2", 1, "Mittag in Sölden", "food", 86.4, "dani"),
  expense("e3", 1, "Tanken Sölden", "fuel", 61.3, "alex", ["alex", "bea", "chris"]),
  expense("e4", 2, "Laden Prad", "charging", 14.2, "dani", ["dani"]),
  expense("e5", 2, "Abendessen Bormio", "food", 148, "bea"),
  expense("e6", 2, "Kaffee Passhöhe", "food", 18, "chris", [], { currency: "CHF", rate: 1.04 }),
];

export function loadDemo() {
  const put = (c: string, list: { id: string }[]) => localStorage.setItem(`tourenplaner:${c}`, JSON.stringify(Object.fromEntries(list.map((x) => [x.id, x]))));
  put("members", members);
  put("tours", [tour]);
  put("stages", stages);
  put("hotels", hotels);
  put("expenses", expenses);
  localStorage.removeItem("tourenplaner:settings");
  localStorage.setItem("tourenplaner:me", "alex");
}

export const DEMO_TOUR_ID = tour.id;

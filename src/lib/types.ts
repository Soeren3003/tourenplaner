/** Gemeinsame Felder aller gespeicherten Datensätze. */
export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface Member extends Entity {
  name: string;
  /** Motorrad, z. B. „BMW R 1250 GS“ */
  bike: string;
  /** Reichweite mit einer Tankfüllung in km */
  tankRangeKm: number;
  /** Verbrauch in l/100 km */
  consumption: number;
  phone: string;
  emergencyContact: string;
  color: string;
  notes: string;
}

export type TourStatus = "idea" | "planning" | "booked" | "done";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  /** Mitfahrer-ID; leer = alle / niemand bestimmt */
  assignee: string;
}

export interface Tour extends Entity {
  name: string;
  region: string;
  startDate: string;
  endDate: string;
  status: TourStatus;
  memberIds: string[];
  currency: string;
  /** Spritpreis für die Kostenschätzung (je Liter, in Tourwährung) */
  fuelPrice: number;
  notes: string;
  checklist: ChecklistItem[];
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface Waypoint extends LatLon {
  id: string;
  name: string;
}

export interface RouteOptions {
  /** 0 = Autobahn meiden … 1 = bevorzugen (Valhalla use_highways) */
  useHighways: number;
  avoidTolls: boolean;
  avoidFerries: boolean;
}

export type RouteSource = "routing" | "gpx" | "manual";

export interface Stage extends Entity {
  tourId: string;
  date: string;
  /** Reihenfolge innerhalb eines Tages (mehrere Etappen am selben Tag) */
  order: number;
  title: string;
  /** Abfahrtszeit „09:00“ */
  departure: string;
  /** geplante Pausen in Minuten (Mittag, Tanken, Kaffee) */
  pauseMinutes: number;
  waypoints: Waypoint[];
  options: RouteOptions;
  source: RouteSource;
  /** Streckenverlauf als Google-Polyline (Genauigkeit 5) */
  geometry: string;
  distanceKm: number;
  durationMin: number;
  /** Strecke/Zeit zwischen aufeinanderfolgenden Wegpunkten */
  legs: { distanceKm: number; durationMin: number }[];
  /** tatsächlich gefahren (null = nicht erfasst) */
  actualKm: number | null;
  actualMin: number | null;
  ridden: boolean;
  notes: string;
}

export type HotelStatus = "idea" | "requested" | "booked" | "cancelled";

export interface Hotel extends Entity {
  tourId: string;
  name: string;
  address: string;
  lat: number | null;
  lon: number | null;
  checkIn: string;
  checkOut: string;
  status: HotelStatus;
  /** Gesamtpreis für die Gruppe, in Tourwährung */
  price: number;
  /** Mitfahrer-ID, die bezahlt hat; leer = noch offen / zahlt jeder selbst */
  paidBy: string;
  /** Aufteilung; leer = alle Teilnehmer der Tour */
  splitAmong: string[];
  garage: boolean;
  breakfast: boolean;
  phone: string;
  url: string;
  confirmation: string;
  notes: string;
}

export type ExpenseCategory = "fuel" | "food" | "hotel" | "toll" | "ferry" | "fee" | "repair" | "other";

export interface Expense extends Entity {
  tourId: string;
  date: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  /** Umrechnungskurs: 1 Einheit Fremdwährung = rate × Tourwährung */
  rate: number;
  paidBy: string;
  /** leer = alle Teilnehmer der Tour */
  splitAmong: string[];
  notes: string;
}

export interface Settings {
  id: "settings";
  updatedAt: string;
  defaultCurrency: string;
  defaultFuelPrice: number;
  defaultRouteOptions: RouteOptions;
  defaultDeparture: string;
  defaultPauseMinutes: number;
  /** Sicherheitsfaktor auf die Tankreichweite (0,8 = nach 80 % tanken) */
  tankReserve: number;
  checklistTemplate: string[];
}

export interface FileMeta {
  name: string;
  size: number;
  modified: number;
}

export interface WebdavConfig {
  enabled: boolean;
  url: string;
  username: string;
  remoteFolder: string;
  autoSyncMinutes: number;
}

export interface LocalConfig {
  dataDir: string;
  webdav: WebdavConfig;
}

export interface SyncReport {
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: string[];
  errors: string[];
  finishedAt: string;
}

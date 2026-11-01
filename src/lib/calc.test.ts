// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { balances, costItems, fuelInfo, settle } from "./calc";
import { newExpense, newHotel, newMember, newTour, defaultSettings } from "./defaults";
import { bestInsertIndex, buildGpx, decodePolyline, encodePolyline, parseGpx } from "./geo";

const s = defaultSettings();

function setup() {
  const [a, b, c] = [0, 1, 2].map((i) => ({ ...newMember(i), name: "ABC"[i] }));
  const tour = newTour(s, [a.id, b.id, c.id]);
  return { a, b, c, tour };
}

describe("Kostenaufteilung", () => {
  it("teilt eine Ausgabe gleichmäßig und schlägt Überweisungen vor", () => {
    const { a, b, c, tour } = setup();
    const e = { ...newExpense(tour, a.id, tour.startDate), amount: 90 };
    const bal = balances(tour.memberIds, costItems(tour, [e], []));
    expect(bal.find((x) => x.memberId === a.id)?.balance).toBe(60);
    expect(settle(bal)).toEqual([
      { from: b.id, to: a.id, amount: 30 },
      { from: c.id, to: a.id, amount: 30 },
    ]);
  });

  it("rechnet Fremdwährung um und berücksichtigt Teilgruppen", () => {
    const { a, b, tour } = setup();
    const e = { ...newExpense(tour, b.id, tour.startDate), amount: 50, currency: "CHF", rate: 1.06, splitAmong: [a.id, b.id] };
    const bal = balances(tour.memberIds, costItems(tour, [e], []));
    expect(settle(bal)).toEqual([{ from: a.id, to: b.id, amount: 26.5 }]);
  });

  it("Hotels zählen mit; ohne Zahler zahlt jeder selbst", () => {
    const { a, tour } = setup();
    const h1 = { ...newHotel(tour.id, tour.startDate), price: 300, paidBy: a.id };
    const h2 = { ...newHotel(tour.id, tour.startDate), price: 240, paidBy: "" };
    const cancelled = { ...newHotel(tour.id, tour.startDate), price: 999, paidBy: a.id, status: "cancelled" as const };
    const bal = balances(tour.memberIds, costItems(tour, [], [h1, h2, cancelled]));
    expect(bal.map((x) => x.share)).toEqual([180, 180, 180]);
    expect(settle(bal).reduce((sum, t) => sum + t.amount, 0)).toBe(200);
  });
});

describe("Sprit", () => {
  it("nutzt die kleinste Reichweite der Gruppe", () => {
    const { a, b } = setup();
    const f = fuelInfo(500, [{ ...a, tankRangeKm: 400 }, { ...b, tankRangeKm: 250, consumption: 6 }], 0.8, 2)!;
    expect(f.rangeKm).toBe(200);
    expect(f.limitedBy).toBe("B");
    expect(f.stops).toBe(2);
    expect(f.liters).toBe(55);
  });
});

describe("Geo", () => {
  it("Polyline hin und zurück", () => {
    const pts = [
      { lat: 47.12345, lon: 11.54321 },
      { lat: 47.2, lon: 11.6 },
      { lat: 46.9999, lon: 10.0001 },
    ];
    expect(decodePolyline(encodePolyline(pts))).toEqual(pts);
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      { lat: 38.5, lon: -120.2 },
      { lat: 40.7, lon: -120.95 },
      { lat: 43.252, lon: -126.453 },
    ]);
  });

  it("fügt Punkte mit dem kleinsten Umweg ein", () => {
    const route = [
      { lat: 47, lon: 10 },
      { lat: 47, lon: 12 },
    ];
    expect(bestInsertIndex(route, { lat: 47.1, lon: 11 })).toBe(1);
    expect(bestInsertIndex(route, { lat: 47, lon: 13 })).toBe(2);
    expect(bestInsertIndex(route, { lat: 47, lon: 9 })).toBe(0);
  });

  it("GPX schreiben und wieder lesen", () => {
    const gpx = buildGpx("Test & Co", [
      {
        name: "Tag 1",
        waypoints: [
          { id: "1", name: "Start", lat: 47, lon: 10 },
          { id: "2", name: "Ziel", lat: 47.5, lon: 10.5 },
        ],
        track: [
          { lat: 47, lon: 10 },
          { lat: 47.2, lon: 10.2 },
          { lat: 47.5, lon: 10.5 },
        ],
      },
    ]);
    const r = parseGpx(gpx);
    expect(r.name).toBe("Test & Co");
    expect(r.track).toHaveLength(3);
    expect(r.waypoints.map((w) => w.name)).toEqual(["Start", "Ziel"]);
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { arrival, balances, costItems, energyInfo, normalizeRiders, settle, stageRiders } from "./calc";
import { summarize } from "./summary";
import { newExpense, newHotel, newMember, newStage, newTour, defaultSettings, migrateMember } from "./defaults";
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

describe("Tanken und Laden", () => {
  const prices = { fuel: 2, electricity: 0.5 };

  it("nutzt die kleinste Reichweite der Gruppe", () => {
    const { a, b } = setup();
    const e = energyInfo(500, [{ ...a, tankRangeKm: 400 }, { ...b, tankRangeKm: 250, consumption: 6 }], 0.8, prices)!;
    const f = e.fuel!;
    expect(f.rangeKm).toBe(200);
    expect(f.limitedBy).toBe("B");
    expect(f.stops).toBe(2);
    expect(f.stopKm).toEqual([200, 400]);
    expect(f.amount).toBe(55);
    expect(f.cost).toBe(110);
    expect(e.electric).toBeNull();
    expect(e.chargeMinutes).toBe(0);
  });

  it("rechnet Elektromotorräder getrennt in kWh mit Ladezeit", () => {
    const { a, b, c } = setup();
    const ebike = { ...c, drive: "electric" as const, tankRangeKm: 150, consumption: 10, chargeMinutes: 40 };
    const e = energyInfo(300, [{ ...a, tankRangeKm: 400 }, { ...b, tankRangeKm: 350 }, ebike], 0.8, prices)!;
    expect(e.fuel!.stops).toBe(1);
    expect(e.fuel!.amount).toBe(30);
    // 150 km × 0,8 = 120 km nutzbar → Stopps bei km 120 und 240
    expect(e.electric!.rangeKm).toBe(120);
    expect(e.electric!.stops).toBe(2);
    expect(e.electric!.amount).toBe(30);
    expect(e.electric!.cost).toBe(15);
    expect(e.cost).toBe(75);
    expect(e.chargeMinutes).toBe(80);
  });

  it("verschiebt die Ankunft um die Ladezeit", () => {
    const st = { ...newStage(s, "t", "2026-06-01"), departure: "09:00", durationMin: 300, pauseMinutes: 60 };
    expect(arrival(st)).toBe("15:00");
    expect(arrival(st, 80)).toBe("16:20");
  });

  it("alte Mitfahrer ohne Antrieb gelten als Verbrenner", () => {
    const { a } = setup();
    const { drive: _d, chargeMinutes: _c, ...old } = a;
    expect(migrateMember(old).drive).toBe("fuel");
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

describe("Mitfahrer je Etappe", () => {
  it("ohne Auswahl fahren alle, sonst nur die gewählten", () => {
    const { a, b, c } = setup();
    expect(stageRiders({ memberIds: [] }, [a, b, c])).toEqual([a, b, c]);
    expect(stageRiders({ memberIds: [b.id, c.id] }, [a, b, c])).toEqual([b, c]);
    // ausgetretene Mitfahrer zählen nicht; bleibt niemand übrig, fahren alle
    expect(stageRiders({ memberIds: ["weg"] }, [a, b])).toEqual([a, b]);
  });

  it("alle ausgewählt wird als „alle“ gespeichert", () => {
    expect(normalizeRiders(["x", "y"], ["x", "y"])).toEqual([]);
    expect(normalizeRiders(["x", "z"], ["x", "y"])).toEqual(["x"]);
  });

  it("Anreise zu zweit, Rundfahrt mit allen: Verbrauch und km je Person", () => {
    const { a, b, c, tour } = setup();
    const members = [a, b, c].map((m) => ({ ...m, consumption: 5, tankRangeKm: 400 }));
    const st = (date: string, memberIds: string[]) => ({ ...newStage(s, tour.id, date), memberIds, distanceKm: 200, ridden: true });
    const stages = [st(tour.startDate, [b.id, c.id]), st(tour.endDate, [])];
    const sum = summarize(tour, { stages, hotels: [], expenses: [], members, settings: s });
    // Tag 1: 2 × 10 l, Tag 2: 3 × 10 l
    expect(sum.energy.fuel?.amount).toBe(50);
    expect(sum.memberKm(a.id)).toBe(200);
    expect(sum.memberKm(b.id)).toBe(400);
  });
});

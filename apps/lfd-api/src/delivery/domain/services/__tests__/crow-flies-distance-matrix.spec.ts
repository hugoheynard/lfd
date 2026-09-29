import { UnknownCostPointError } from "../../errors/delivery-routing-errors.js";
import { geoPoint } from "../../value-objects/geo-point.js";
import { RoutingSettings } from "../../value-objects/routing-settings.js";
import {
  crowFliesCost,
  CrowFliesDistanceMatrix,
  haversineMeters,
} from "../crow-flies-distance-matrix.js";

const CHAMBERY = geoPoint(45.5646, 5.9178);
const ALBERTVILLE = geoPoint(45.6755, 6.3926);

describe("haversine", () => {
  it("rend zéro entre un point et lui-même", () => {
    expect(haversineMeters(CHAMBERY, CHAMBERY)).toBe(0);
  });

  it("mesure un degré de méridien à ~111,2 km", () => {
    expect(haversineMeters(geoPoint(45, 6), geoPoint(46, 6))).toBeCloseTo(111_195, -1);
  });

  it("Chambéry – Albertville à vol d'oiseau : ~39 km, dans les deux sens", () => {
    const there = haversineMeters(CHAMBERY, ALBERTVILLE);
    expect(there).toBeGreaterThan(38_000);
    expect(there).toBeLessThan(40_000);
    expect(haversineMeters(ALBERTVILLE, CHAMBERY)).toBeCloseTo(there, 6);
  });
});

describe("la matrice à vol d'oiseau (L7-C2)", () => {
  const points = new Map([
    ["depot", geoPoint(45, 6)],
    ["a", geoPoint(46, 6)],
  ]);

  it("multiplie par le détour, puis divise par la vitesse", () => {
    const settings = RoutingSettings.define({
      ...RoutingSettings.DEFAULTS,
      detourPercent: 150,
      averageSpeedKmh: 60,
    });
    const cost = crowFliesCost(points, settings);

    const meters = cost.meters("depot", "a");
    expect(meters).toBeCloseTo(111_195 * 1.5, -1);
    // 60 km/h = 1 km par minute.
    expect(cost.seconds("depot", "a")).toBeCloseTo((meters / 1000) * 60, 6);
  });

  it("lève sur un identifiant qu'elle ne connaît pas — jamais deux matrices mêlées", () => {
    const cost = crowFliesCost(points, RoutingSettings.defaults());

    expect(() => cost.meters("depot", "inconnu")).toThrow(UnknownCostPointError);
    expect(() => cost.seconds("inconnu", "a")).toThrow(UnknownCostPointError);
  });

  it("le port rend la même fonction que la version synchrone", async () => {
    const settings = RoutingSettings.defaults();
    const cost = await new CrowFliesDistanceMatrix().build(points, settings);

    expect(cost.seconds("a", "depot")).toBe(crowFliesCost(points, settings).seconds("a", "depot"));
  });
});

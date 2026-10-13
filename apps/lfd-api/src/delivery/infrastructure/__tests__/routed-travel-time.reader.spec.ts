import type { GeoPoint } from "../../domain/value-objects/geo-point.js";
import { type CostFn, DistanceMatrix } from "../../domain/ports/distance-matrix.js";
import { StraightLineDistanceMatrix } from "../../domain/ports/__tests__/road-routing-doubles.js";
import { DisabledDistanceMatrix } from "../disabled-road-routing.js";
import { RoutedTravelTimeReader } from "../routed-travel-time.reader.js";

/** Une matrice qui rend une durée fixe, en secondes. */
class FixedSecondsMatrix extends DistanceMatrix {
  constructor(private readonly secondsValue: number) {
    super();
  }

  build(_points: ReadonlyMap<string, GeoPoint>): Promise<CostFn> {
    return Promise.resolve({ meters: () => 0, seconds: () => this.secondsValue });
  }
}

class BrokenMatrix extends DistanceMatrix {
  build(): Promise<CostFn> {
    return Promise.reject(new RangeError("panne inattendue"));
  }
}

const LAB = { lat: 45.45, lng: 6.98 };
const VILLAGE = { lat: 45.47, lng: 6.9 };

describe("RoutedTravelTimeReader — le trajet d'un transfert", () => {
  it("demande la route du départ vers le site, une seule matrice à deux points", async () => {
    const matrix = new StraightLineDistanceMatrix();
    const minutes = await new RoutedTravelTimeReader(matrix).minutesBetween(LAB, VILLAGE);

    expect(matrix.requested).toHaveLength(1);
    expect([...(matrix.requested[0]?.values() ?? [])]).toEqual([LAB, VILLAGE]);
    expect(minutes).toBeGreaterThan(0);
  });

  it("arrondit à la minute supérieure : un départ requis ne se calcule pas en retard", async () => {
    await expect(
      new RoutedTravelTimeReader(new FixedSecondsMatrix(1201)).minutesBetween(LAB, VILLAGE),
    ).resolves.toBe(21);
  });

  it("rend null, sans durée inventée, quand le calcul routier n'est pas branché", async () => {
    await expect(
      new RoutedTravelTimeReader(new DisabledDistanceMatrix()).minutesBetween(LAB, VILLAGE),
    ).resolves.toBeNull();
  });

  it("laisse passer une panne d'une autre nature", async () => {
    await expect(
      new RoutedTravelTimeReader(new BrokenMatrix()).minutesBetween(LAB, VILLAGE),
    ).rejects.toThrow(RangeError);
  });
});

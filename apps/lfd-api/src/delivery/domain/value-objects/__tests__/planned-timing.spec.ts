import { InvalidPlannedTimingError } from "../../errors/delivery-round-errors.js";
import { PlannedTiming } from "../planned-timing.js";

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTURE = new Date(3_600_000);
const RETURN = new Date(7_200_000);

describe("PlannedTiming — l'horaire prévu d'une tournée", () => {
  it("garde départ, retour et mètres", () => {
    const timing = PlannedTiming.of({ departureAt: DEPARTURE, returnAt: RETURN, meters: 42_000 });
    expect(timing.departureAt).toEqual(DEPARTURE);
    expect(timing.returnAt).toEqual(RETURN);
    expect(timing.meters).toBe(42_000);
  });

  it("admet un retour à l'instant du départ, et zéro mètre", () => {
    expect(
      PlannedTiming.of({ departureAt: DEPARTURE, returnAt: DEPARTURE, meters: 0 }).meters,
    ).toBe(0);
  });

  it.each([
    ["un retour avant le départ", { departureAt: RETURN, returnAt: DEPARTURE, meters: 1 }],
    ["une distance négative", { departureAt: DEPARTURE, returnAt: RETURN, meters: -1 }],
    ["une distance fractionnaire", { departureAt: DEPARTURE, returnAt: RETURN, meters: 1.5 }],
    ["un instant illisible", { departureAt: new Date(Number.NaN), returnAt: RETURN, meters: 1 }],
  ])("refuse %s", (_case, input) => {
    expect(() => PlannedTiming.of(input)).toThrow(InvalidPlannedTimingError);
  });

  it("relu en base : nul dès qu'une colonne l'est", () => {
    expect(PlannedTiming.restore({ departureAt: null, returnAt: null, meters: null })).toBeNull();
    expect(
      PlannedTiming.restore({ departureAt: DEPARTURE, returnAt: RETURN, meters: null }),
    ).toBeNull();
    expect(
      PlannedTiming.restore({ departureAt: DEPARTURE, returnAt: RETURN, meters: 5 })?.meters,
    ).toBe(5);
  });

  it("compare par valeur", () => {
    const a = PlannedTiming.of({ departureAt: DEPARTURE, returnAt: RETURN, meters: 5 });
    expect(
      a.equals(PlannedTiming.of({ departureAt: DEPARTURE, returnAt: RETURN, meters: 5 })),
    ).toBe(true);
    expect(
      a.equals(PlannedTiming.of({ departureAt: DEPARTURE, returnAt: RETURN, meters: 6 })),
    ).toBe(false);
    expect(a.equals(null)).toBe(false);
  });
});

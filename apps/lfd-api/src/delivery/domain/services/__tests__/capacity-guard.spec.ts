import { capacityGuardOf } from "../capacity-guard.js";
import type { PlanVehicle } from "../loading-volume.js";
import { capacityOf, ONE_STACK, ROOMY } from "./capacity-fixtures.js";

const route = (...ids: string[]) => ({
  roundId: null,
  stops: ids.map((id) => ({ id, window: null })),
});

describe("la garde de capacité (CA4)", () => {
  it("une tournée tient tant que le plan de chargement ne déborde pas", () => {
    const guard = capacityGuardOf(capacityOf({ small: ONE_STACK }, { a: 2, b: 3, c: 1 }));

    expect(guard.fits("small", [route("a", "b")])).toBe(true);
    expect(guard.fits("small", [route("a", "b", "c")])).toBe(false);
  });

  it("juge chaque tournée à part : deux passages ne s'additionnent pas", () => {
    const guard = capacityGuardOf(capacityOf({ small: ONE_STACK }, { a: 3, b: 3 }));

    expect(guard.fits("small", [route("a"), route("b")])).toBe(true);
    expect(guard.fits("small", [route("a", "b")])).toBe(false);
  });

  it("un véhicule sans cotes ne porte aucun bac — mais une tournée sans bac tient partout", () => {
    const unmeasured: PlanVehicle = {
      name: "Inconnu",
      cargoLiters: null,
      refrigeratedLiters: null,
      floor: null,
    };
    const guard = capacityGuardOf(capacityOf({ unmeasured }, { a: 1 }));

    expect(guard.fits("unmeasured", [route("a")])).toBe(false);
    expect(guard.fits("unmeasured", [route("pinned_without_bins")])).toBe(true);
    expect(guard.fits("absent", [route("a")])).toBe(false);
  });

  it("refuse au volume sans poser une pile, et tient une grande caisse", () => {
    const guard = capacityGuardOf(capacityOf({ big: ROOMY, small: ONE_STACK }, { a: 40 }));

    expect(guard.fits("small", [route("a")])).toBe(false);
    expect(guard.fits("big", [route("a")])).toBe(true);
  });
});

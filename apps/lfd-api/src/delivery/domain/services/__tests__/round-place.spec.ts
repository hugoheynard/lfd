import type { PlanVehicle } from "../loading-volume.js";
import { roundPlaceOf } from "../round-place.js";
import { capacityOf, ONE_STACK } from "./capacity-fixtures.js";

const UNMEASURED: PlanVehicle = {
  name: "Inconnu",
  cargoLiters: null,
  refrigeratedLiters: null,
  floor: null,
};

describe("la place d'une tournée enregistrée", () => {
  it("tient quand la demande connue tient et que rien n'est inconnu", () => {
    const capacity = capacityOf({ small: ONE_STACK }, { a: 2, b: 3 });

    expect(
      roundPlaceOf({ capacity, unknown: new Set(), vehicleId: "small", orderIds: ["a", "b"] }),
    ).toEqual({ status: "fits", unknownOrders: 0 });
  });

  it("dit « dépassée » quand une commande posée à la main fait déborder la part connue", () => {
    const capacity = capacityOf({ small: ONE_STACK }, { a: 2, b: 3, late: 1 });

    expect(
      roundPlaceOf({
        capacity,
        unknown: new Set(),
        vehicleId: "small",
        orderIds: ["a", "b", "late"],
      }).status,
    ).toBe("over");
  });

  it("dit « non vérifiée » quand la part connue tient mais qu'une commande est inconnue", () => {
    const capacity = capacityOf({ small: ONE_STACK }, { a: 1 });

    expect(
      roundPlaceOf({ capacity, unknown: new Set(["x"]), vehicleId: "small", orderIds: ["a", "x"] }),
    ).toEqual({ status: "unverified", unknownOrders: 1 });
  });

  it("garde « dépassée » même avec des inconnues : la part connue déborde déjà", () => {
    const capacity = capacityOf({ small: ONE_STACK }, { a: 3, b: 3 });

    expect(
      roundPlaceOf({
        capacity,
        unknown: new Set(["x"]),
        vehicleId: "small",
        orderIds: ["a", "b", "x"],
      }),
    ).toEqual({ status: "over", unknownOrders: 1 });
  });

  it("dit « véhicule sans cotes » plutôt que « dépassée » quand il porte des bacs", () => {
    const capacity = capacityOf({ unmeasured: UNMEASURED }, { a: 1 });

    expect(
      roundPlaceOf({ capacity, unknown: new Set(), vehicleId: "unmeasured", orderIds: ["a"] })
        .status,
    ).toBe("unmeasured");
    expect(
      roundPlaceOf({ capacity, unknown: new Set(["x"]), vehicleId: "unmeasured", orderIds: ["x"] })
        .status,
    ).toBe("unverified");
  });
});

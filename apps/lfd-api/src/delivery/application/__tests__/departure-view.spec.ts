import type { DepartureCandidate } from "../../channels/commerce/index.js";
import { departureViewOf } from "../departure-view.js";

function point(id: string, isDefault: boolean): DepartureCandidate {
  return {
    pickupAddressId: id,
    label: `Point ${id}`,
    address: {
      label: `Point ${id}`,
      ligne1: "1 rue",
      ligne2: "",
      codePostal: "75001",
      ville: "Paris",
      pays: "France",
    },
    gps: isDefault ? { lat: 48.85, lng: 2.35 } : null,
    isDefault,
  };
}

describe("departureViewOf", () => {
  const points = [point("labo", true), point("boutique", false)];

  it("sans choix, part du point par défaut", () => {
    const view = departureViewOf(null, points);
    expect(view.source).toBe("default");
    expect(view.point?.pickupAddressId).toBe("labo");
    expect(view.choices.map((choice) => choice.pickupAddressId)).toEqual(["labo", "boutique"]);
  });

  it("avec un choix existant, part du point choisi", () => {
    const view = departureViewOf("boutique", points);
    expect(view.source).toBe("explicit");
    expect(view.point).toMatchObject({ pickupAddressId: "boutique", gps: null });
  });

  it("un choix dont le point a disparu retombe sur le défaut, sans rien inventer", () => {
    const view = departureViewOf("supprime", points);
    expect(view.source).toBe("default");
    expect(view.point?.pickupAddressId).toBe("labo");
  });

  it("aucun point de retrait : pas de départ", () => {
    expect(departureViewOf("labo", [])).toEqual({ source: "default", point: null, choices: [] });
  });
});

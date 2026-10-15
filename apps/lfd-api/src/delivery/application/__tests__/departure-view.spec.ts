import type { DepartureCandidate } from "../../channels/commerce/index.js";
import { departureViewOf } from "../departure-view.js";

function point(id: string, located: boolean): DepartureCandidate {
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
    gps: located ? { lat: 48.85, lng: 2.35 } : null,
  };
}

/**
 * Hugo, 2026-10-15 : il n'y a plus de « site par défaut ». Sans choix valable,
 * le départ n'est déduit que d'un candidat UNIQUE ; à plusieurs, l'écran
 * demande de choisir et le calcul des tournées refuse.
 */
describe("departureViewOf", () => {
  const points = [point("labo", true), point("boutique", false)];

  it("sans choix et un seul site qui livre, part de lui", () => {
    const view = departureViewOf(null, [point("labo", true)]);
    expect(view.source).toBe("default");
    expect(view.point?.pickupAddressId).toBe("labo");
  });

  it("sans choix et plusieurs sites qui livrent, ne déduit AUCUN départ", () => {
    const view = departureViewOf(null, points);
    expect(view.source).toBe("default");
    expect(view.point).toBeNull();
    expect(view.choices.map((choice) => choice.pickupAddressId)).toEqual(["labo", "boutique"]);
  });

  it("ne prend pas le premier candidat pour un défaut, quel que soit l'ordre", () => {
    expect(departureViewOf(null, [...points].reverse()).point).toBeNull();
  });

  it("avec un choix existant, part du point choisi", () => {
    const view = departureViewOf("boutique", points);
    expect(view.source).toBe("explicit");
    expect(view.point).toMatchObject({ pickupAddressId: "boutique", gps: null });
  });

  it("un choix dont le site a disparu, à plusieurs candidats : aucun départ, rien d'inventé", () => {
    const view = departureViewOf("archive", points);
    expect(view.source).toBe("default");
    expect(view.point).toBeNull();
  });

  it("un choix dont le site a disparu, un seul candidat : part de lui", () => {
    expect(departureViewOf("archive", [point("boutique", false)]).point?.pickupAddressId).toBe(
      "boutique",
    );
  });

  it("aucun site qui livre : pas de départ", () => {
    expect(departureViewOf("labo", [])).toEqual({ source: "default", point: null, choices: [] });
  });
});

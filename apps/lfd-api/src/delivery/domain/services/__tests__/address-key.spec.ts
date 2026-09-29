import { addressKeyOf } from "../address-key.js";

const ADDRESS = {
  ligne1: "12, Rue du Pont-Neuf",
  ligne2: "",
  codePostal: "73000",
  ville: "Chambéry",
  pays: "France",
};

describe("la clé d'une adresse pour le cache du géocodage (L7-C10)", () => {
  it("deux saisies de la même adresse ont la même clé", () => {
    expect(addressKeyOf({ ...ADDRESS, ligne1: "12 rue du pont neuf", ville: "CHAMBERY  " })).toBe(
      addressKeyOf(ADDRESS),
    );
  });

  it("deux adresses différentes n'ont pas la même clé", () => {
    expect(addressKeyOf({ ...ADDRESS, ligne1: "14, Rue du Pont-Neuf" })).not.toBe(
      addressKeyOf(ADDRESS),
    );
  });

  it("ne mêle pas deux champs : la séparation compte", () => {
    expect(addressKeyOf({ ...ADDRESS, ligne1: "12 rue", ligne2: "du pont neuf" })).not.toBe(
      addressKeyOf(ADDRESS),
    );
  });
});

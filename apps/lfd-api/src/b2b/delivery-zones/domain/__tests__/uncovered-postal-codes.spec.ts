import { uncoveredPostalCodes, type PostalCodeHolder } from "../uncovered-postal-codes.js";

/** Le rapprochement adresses ↔ zones, sans Nest ni double : la règle du checkout. */

function holder(postalCode: string, companyId: string, city = "Tignes"): PostalCodeHolder {
  return { postalCode, city, companyId, companyName: `Compte ${companyId}` };
}

describe("uncoveredPostalCodes", () => {
  it("n'avertit pas pour un code qu'une zone couvre exactement", () => {
    expect(uncoveredPostalCodes([["73150"]], [holder("73150", "a")])).toEqual([]);
  });

  it("tient pour couvert un code qu'un préfixe plus court couvre", () => {
    expect(uncoveredPostalCodes([["731"]], [holder("73150", "a")])).toEqual([]);
  });

  it("rend un code non couvert avec sa ville et son compte", () => {
    expect(uncoveredPostalCodes([["731"]], [holder("73320", "a")])).toEqual([
      {
        postalCode: "73320",
        cities: ["Tignes"],
        companyCount: 1,
        companies: [{ id: "a", name: "Compte a" }],
      },
    ]);
  });

  it("regroupe par code, compte chaque compte une fois et n'en nomme que trois", () => {
    const [view] = uncoveredPostalCodes(
      [],
      [
        holder("73320", "d", "Tignes"),
        holder("73320", "c", "Tignes 2100"),
        holder("73320", "b"),
        holder("73320", "a"),
        holder("73320", "a"),
      ],
    );
    expect(view).toEqual({
      postalCode: "73320",
      cities: ["Tignes", "Tignes 2100"],
      companyCount: 4,
      companies: [
        { id: "a", name: "Compte a" },
        { id: "b", name: "Compte b" },
        { id: "c", name: "Compte c" },
      ],
    });
  });

  it("met d'abord le code qui bloque le plus de comptes", () => {
    const views = uncoveredPostalCodes(
      [],
      [holder("01000", "a"), holder("99000", "b"), holder("99000", "c")],
    );
    expect(views.map((view) => view.postalCode)).toEqual(["99000", "01000"]);
  });

  it("ignore une adresse sans code postal", () => {
    expect(uncoveredPostalCodes([], [holder("", "a")])).toEqual([]);
  });
});

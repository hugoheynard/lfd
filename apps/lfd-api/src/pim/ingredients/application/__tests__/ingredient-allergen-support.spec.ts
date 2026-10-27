import { citedUnion } from "../ingredient-allergen-support.js";

describe("citedUnion", () => {
  it("rend l'union des codes des ingrédients cités, dédupliquée et rangée", () => {
    expect(citedUnion([["SH", "BWD"], ["SH"]])).toEqual(["BWD", "SH"]);
  });

  it("rend un ensemble vide quand rien n'est cité", () => {
    expect(citedUnion([])).toEqual([]);
  });
});

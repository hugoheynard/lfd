import { citedNotDeclared, effectiveAllergens } from "../effective-allergens.js";

/**
 * Les deux règles de `documentation/pim/plan-allergenes-jamais-bloquants.md` —
 * l'état SERVI, la déclaration enregistrée n'étant jamais réécrite.
 */
describe("effectiveAllergens — règle A : ce que la composition cite est déclaré", () => {
  it("ajoute les codes cités après les allergènes déclarés, sans doublon", () => {
    const served = effectiveAllergens(
      { declared: ["milk"], mayContain: [] },
      ["gluten", "milk"],
      [],
    );

    expect(served).toEqual({ allergens: ["milk", "gluten"], mayContain: [], precautionary: false });
  });

  it("retire des traces un code que la composition cite", () => {
    const served = effectiveAllergens(
      { declared: [], mayContain: ["gluten", "nuts"] },
      ["gluten"],
      [],
    );

    expect(served.allergens).toEqual(["gluten"]);
    expect(served.mayContain).toEqual(["nuts"]);
  });

  it("ne retire jamais un allergène déclaré que la composition ignore", () => {
    const served = effectiveAllergens({ declared: ["sesame"], mayContain: [] }, [], []);

    expect(served.allergens).toEqual(["sesame"]);
  });

  it("garde « aucun allergène » comme une déclaration, sans précaution", () => {
    const served = effectiveAllergens({ declared: [], mayContain: [] }, [], ["gluten", "milk"]);

    expect(served).toEqual({ allergens: [], mayContain: [], precautionary: false });
  });

  it("ne modifie pas la déclaration qu'on lui passe", () => {
    const sheet = { declared: ["milk"], mayContain: ["gluten"] };

    effectiveAllergens(sheet, ["gluten"], []);

    expect(sheet).toEqual({ declared: ["milk"], mayContain: ["gluten"] });
  });
});

describe("effectiveAllergens — règle B : sans déclaration, par précaution", () => {
  it("sert les cités en allergènes et l'union du catalogue, moins eux, en traces", () => {
    const served = effectiveAllergens(null, ["gluten"], ["eggs", "gluten", "milk"]);

    expect(served).toEqual({
      allergens: ["gluten"],
      mayContain: ["eggs", "milk"],
      precautionary: true,
    });
  });

  it("suit l'union qu'on lui donne : un catalogue qui grandit élargit les traces", () => {
    const before = effectiveAllergens(null, [], ["milk"]);
    const after = effectiveAllergens(null, [], ["milk", "sesame"]);

    expect(before.mayContain).toEqual(["milk"]);
    expect(after.mayContain).toEqual(["milk", "sesame"]);
  });
});

describe("citedNotDeclared", () => {
  it("rend ce que la règle A ajoute, jamais un retrait", () => {
    expect(citedNotDeclared({ declared: ["milk"], mayContain: [] }, ["gluten", "milk"])).toEqual([
      "gluten",
    ]);
    expect(citedNotDeclared({ declared: ["gluten", "milk"], mayContain: [] }, ["gluten"])).toEqual(
      [],
    );
  });

  it("ne rend rien sans déclaration : rien n'est ajouté à un silence", () => {
    expect(citedNotDeclared(null, ["gluten"])).toEqual([]);
  });
});

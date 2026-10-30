import {
  ancestorsOfEach,
  directSuccessorsOf,
  latestOfEach,
  MAX_SUCCESSION_DEPTH,
} from "../sale-reference-succession.js";

const born = (sku: string, detachedFromSku: string, isDefault = true) => ({
  sku,
  detachedFromSku,
  isDefault,
});

describe("directSuccessorsOf", () => {
  it("désigne l'unique article né d'une référence", () => {
    expect(directSuccessorsOf([born("P-NEW-1", "P-OLD-2")])).toEqual(
      new Map([["P-OLD-2", "P-NEW-1"]]),
    );
  });

  it("préfère le défaut quand la fiche née porte plusieurs articles", () => {
    const successors = directSuccessorsOf([
      born("P-NEW-2", "P-OLD-2", false),
      born("P-NEW-1", "P-OLD-2", true),
    ]);

    expect(successors.get("P-OLD-2")).toBe("P-NEW-1");
  });

  it("ne choisit pas sans défaut unique — deux lignes plutôt qu'un choix inventé", () => {
    const successors = directSuccessorsOf([
      born("P-NEW-1", "P-OLD-2", false),
      born("P-NEW-2", "P-OLD-2", false),
    ]);

    expect(successors.has("P-OLD-2")).toBe(false);
  });

  it("ignore un article qui se désignerait lui-même", () => {
    expect(directSuccessorsOf([born("P-X", "P-X")]).size).toBe(0);
  });
});

describe("latestOfEach", () => {
  it("suit la lignée jusqu'au bout", () => {
    const successors = new Map([
      ["A", "B"],
      ["B", "C"],
    ]);

    expect(latestOfEach(["A", "B", "Z"], successors)).toEqual(
      new Map([
        ["A", "C"],
        ["B", "C"],
      ]),
    );
  });

  it("s'arrête sur un cycle sans boucler", () => {
    const successors = new Map([
      ["A", "B"],
      ["B", "A"],
    ]);

    expect(latestOfEach(["A"], successors).get("A")).toBe("B");
  });

  it(`ne suit pas plus de ${String(MAX_SUCCESSION_DEPTH)} générations`, () => {
    const chain = Array.from({ length: MAX_SUCCESSION_DEPTH + 5 }, (_, index) => [
      `S${String(index)}`,
      `S${String(index + 1)}`,
    ]);
    const successors = new Map(chain.map(([from, to]) => [from ?? "", to ?? ""]));

    expect(latestOfEach(["S0"], successors).get("S0")).toBe(`S${String(MAX_SUCCESSION_DEPTH)}`);
  });
});

describe("ancestorsOfEach", () => {
  it("remonte la lignée, du plus proche au plus lointain", () => {
    const articles = [born("P-2", "P-1"), born("P-3", "P-2")];

    expect(ancestorsOfEach(["P-3"], articles)).toEqual(new Map([["P-3", ["P-2", "P-1"]]]));
  });

  it("un SKU sans ancêtre n'est pas dans la carte", () => {
    expect(ancestorsOfEach(["P-1"], [born("P-2", "P-1")]).size).toBe(0);
  });

  it("un frère non désigné n'hérite pas de l'historique", () => {
    const articles = [born("P-NEW-1", "P-OLD", true), born("P-NEW-2", "P-OLD", false)];

    const ancestors = ancestorsOfEach(["P-NEW-1", "P-NEW-2"], articles);

    expect(ancestors.get("P-NEW-1")).toEqual(["P-OLD"]);
    expect(ancestors.has("P-NEW-2")).toBe(false);
  });

  it("s'arrête sur un cycle", () => {
    const articles = [born("A", "B"), born("B", "A")];

    expect(ancestorsOfEach(["A"], articles)).toEqual(new Map([["A", ["B"]]]));
  });

  it("ne remonte pas au-delà de la borne", () => {
    const articles = Array.from({ length: MAX_SUCCESSION_DEPTH + 4 }, (_, index) =>
      born(`S-${index + 1}`, `S-${index}`),
    );

    const chain = ancestorsOfEach([`S-${MAX_SUCCESSION_DEPTH + 4}`], articles);

    expect([...chain.values()][0]).toHaveLength(MAX_SUCCESSION_DEPTH);
  });
});

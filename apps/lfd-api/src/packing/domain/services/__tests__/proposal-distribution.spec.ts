import { distributeProposal, type UnitsOf } from "../proposal-distribution.js";

/** Un bac M tient 30 croissants ou 10 pains ; un bac F (froid) 12 flans. */
const GRID: Record<string, number> = { "M|CRO": 30, "M|PAI": 10, "F|FLA": 12 };
const unitsOf: UnitsOf = (type, sku) => GRID[`${type}|${sku}`] ?? null;

describe("distributeProposal — un contenu par type × N bacs, coupé bac par bac", () => {
  it("remplit chaque bac avant le suivant, et la moitié en dernier", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 2, half: true, content: [{ sku: "CRO", quantity: 70 }] }],
      unitsOf,
      new Map([["CRO", 70]]),
    );

    expect(bins).toEqual([
      { binTypeId: "M", half: false, lines: [{ sku: "CRO", quantity: 30 }] },
      { binTypeId: "M", half: false, lines: [{ sku: "CRO", quantity: 30 }] },
      { binTypeId: "M", half: true, lines: [{ sku: "CRO", quantity: 10 }] },
    ]);
  });

  it("mélange les articles d'une entrée en additionnant leurs places, dans l'ordre des SKU", () => {
    const bins = distributeProposal(
      [
        {
          binTypeId: "M",
          whole: 2,
          half: false,
          content: [
            { sku: "PAI", quantity: 12 },
            { sku: "CRO", quantity: 15 },
          ],
        },
      ],
      unitsOf,
      new Map([
        ["CRO", 15],
        ["PAI", 12],
      ]),
    );

    // 15 croissants = 0,5 bac ; restent 0,5 bac = 5 pains ; les 7 autres au suivant.
    expect(bins.map((bin) => bin.lines)).toEqual([
      [
        { sku: "CRO", quantity: 15 },
        { sku: "PAI", quantity: 5 },
      ],
      [{ sku: "PAI", quantity: 7 }],
    ]);
  });

  it("ne place que ce qui est disponible : le reste reste à répartir, et le bac existe quand même", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 2, half: false, content: [{ sku: "CRO", quantity: 60 }] }],
      unitsOf,
      new Map([["CRO", 40]]),
    );

    expect(bins.map((bin) => bin.lines)).toEqual([
      [{ sku: "CRO", quantity: 30 }],
      [{ sku: "CRO", quantity: 10 }],
    ]);
  });

  it("un article absent de la réserve ne se place pas, et ses bacs restent vides", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 1, half: false, content: [{ sku: "CRO", quantity: 10 }] }],
      unitsOf,
      new Map(),
    );

    expect(bins).toEqual([{ binTypeId: "M", half: false, lines: [] }]);
  });

  it("la disponibilité se partage entre les entrées, dans l'ordre de la proposition", () => {
    const bins = distributeProposal(
      [
        { binTypeId: "F", whole: 1, half: false, content: [{ sku: "FLA", quantity: 12 }] },
        { binTypeId: "M", whole: 1, half: false, content: [{ sku: "CRO", quantity: 5 }] },
      ],
      unitsOf,
      new Map([
        ["FLA", 8],
        ["CRO", 5],
      ]),
    );

    expect(bins).toEqual([
      { binTypeId: "F", half: false, lines: [{ sku: "FLA", quantity: 8 }] },
      { binTypeId: "M", half: false, lines: [{ sku: "CRO", quantity: 5 }] },
    ]);
  });

  it("un article sans contenance dans le type n'y entre pas", () => {
    const bins = distributeProposal(
      [{ binTypeId: "F", whole: 1, half: false, content: [{ sku: "CRO", quantity: 5 }] }],
      unitsOf,
      new Map([["CRO", 5]]),
    );

    expect(bins).toEqual([{ binTypeId: "F", half: false, lines: [] }]);
  });

  it("tient les fractions : trois tiers remplissent un bac", () => {
    const thirds: UnitsOf = () => 3;
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 1, half: false, content: [{ sku: "X", quantity: 4 }] }],
      thirds,
      new Map([["X", 4]]),
    );

    expect(bins[0]?.lines).toEqual([{ sku: "X", quantity: 3 }]);
  });

  it("est déterministe : mêmes entrées, même résultat", () => {
    const entries = [
      { binTypeId: "M", whole: 3, half: true, content: [{ sku: "CRO", quantity: 100 }] },
    ];
    const available = new Map([["CRO", 100]]);

    expect(distributeProposal(entries, unitsOf, available)).toEqual(
      distributeProposal(entries, unitsOf, available),
    );
  });
});

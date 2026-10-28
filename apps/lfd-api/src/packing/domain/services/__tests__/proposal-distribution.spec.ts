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

/**
 * **Un lot au poids ne se coupe jamais** (P6 de `pricing/vente-au-poids.md`) :
 * le colisage refuse un second contenant pour le même article
 * (`WeightLotSplitError`), la proposition ne doit donc pas en proposer.
 * Un bac M tient 2 000 g de saumon (SAU) ; 30 croissants ; 10 pains.
 */
describe("distributeProposal — un article au poids va entier dans UN bac", () => {
  const WEIGHED_GRID: Record<string, number> = { ...GRID, "M|SAU": 2000 };
  const weighedUnits: UnitsOf = (type, sku) => WEIGHED_GRID[`${type}|${sku}`] ?? null;
  const SAU = new Set(["SAU"]);

  it("un lot exactement à la capacité remplit un bac, entier", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 1, half: false, content: [{ sku: "SAU", quantity: 2000 }] }],
      weighedUnits,
      new Map([["SAU", 2000]]),
      SAU,
    );

    expect(bins.map((bin) => bin.lines)).toEqual([[{ sku: "SAU", quantity: 2000 }]]);
  });

  it("un lot plus lourd qu'un bac n'est PAS coupé : il reste à répartir, les bacs existent", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 2, half: false, content: [{ sku: "SAU", quantity: 3000 }] }],
      weighedUnits,
      new Map([["SAU", 3000]]),
      SAU,
    );

    expect(bins).toEqual([
      { binTypeId: "M", half: false, lines: [] },
      { binTypeId: "M", half: false, lines: [] },
    ]);
  });

  it("la même quantité à la pièce, elle, se coupe — la règle ne vaut que pour le poids", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 2, half: false, content: [{ sku: "SAU", quantity: 3000 }] }],
      weighedUnits,
      new Map([["SAU", 3000]]),
    );

    expect(bins.map((bin) => bin.lines)).toEqual([
      [{ sku: "SAU", quantity: 2000 }],
      [{ sku: "SAU", quantity: 1000 }],
    ]);
  });

  it("une commande mêlée : le lot saute le bac trop plein et va ENTIER au suivant", () => {
    const bins = distributeProposal(
      [
        {
          binTypeId: "M",
          whole: 2,
          half: false,
          content: [
            { sku: "CRO", quantity: 24 },
            { sku: "SAU", quantity: 1250 },
          ],
        },
      ],
      weighedUnits,
      new Map([
        ["CRO", 24],
        ["SAU", 1250],
      ]),
      SAU,
    );

    // 24 croissants = 0,8 bac ; 1 250 g = 0,625 bac : il ne tient pas dans le
    // reste du premier (0,2), il part entier dans le second.
    expect(bins.map((bin) => bin.lines)).toEqual([
      [{ sku: "CRO", quantity: 24 }],
      [{ sku: "SAU", quantity: 1250 }],
    ]);
  });

  it("une commande mêlée qui tient : pièces et lot partagent le même bac", () => {
    const bins = distributeProposal(
      [
        {
          binTypeId: "M",
          whole: 1,
          half: false,
          content: [
            { sku: "CRO", quantity: 15 },
            { sku: "SAU", quantity: 1000 },
          ],
        },
      ],
      weighedUnits,
      new Map([
        ["CRO", 15],
        ["SAU", 1000],
      ]),
      SAU,
    );

    expect(bins.map((bin) => bin.lines)).toEqual([
      [
        { sku: "CRO", quantity: 15 },
        { sku: "SAU", quantity: 1000 },
      ],
    ]);
  });

  it("une réserve partielle : la part disponible du lot va entière dans un seul bac", () => {
    const bins = distributeProposal(
      [{ binTypeId: "M", whole: 1, half: true, content: [{ sku: "SAU", quantity: 2500 }] }],
      weighedUnits,
      new Map([["SAU", 800]]),
      SAU,
    );

    expect(bins.map((bin) => bin.lines)).toEqual([[{ sku: "SAU", quantity: 800 }], []]);
  });

  it("une moitié de bac : un lot de 1 000 g y tient tout juste (0,5 × 2 000 g), 1 050 g non", () => {
    const half = (grams: number) =>
      distributeProposal(
        [{ binTypeId: "M", whole: 0, half: true, content: [{ sku: "SAU", quantity: grams }] }],
        weighedUnits,
        new Map([["SAU", grams]]),
        SAU,
      ).map((bin) => bin.lines);

    expect(half(1000)).toEqual([[{ sku: "SAU", quantity: 1000 }]]);
    expect(half(1050)).toEqual([[]]);
  });

  it("deux lots au poids : chacun dans un seul bac, jamais à cheval", () => {
    const bins = distributeProposal(
      [
        {
          binTypeId: "M",
          whole: 2,
          half: false,
          content: [
            { sku: "SAU", quantity: 1500 },
            { sku: "SAV", quantity: 1500 },
          ],
        },
      ],
      (type, sku) => (sku === "SAV" ? 2000 : weighedUnits(type, sku)),
      new Map([
        ["SAU", 1500],
        ["SAV", 1500],
      ]),
      new Set(["SAU", "SAV"]),
    );

    expect(bins.map((bin) => bin.lines)).toEqual([
      [{ sku: "SAU", quantity: 1500 }],
      [{ sku: "SAV", quantity: 1500 }],
    ]);
  });
});

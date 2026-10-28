import { abandonedOf, decisionMarkOf, printStateOf } from "../prisma-shortfall-aftermath.reader.js";

describe("abandonedOf — le reste abandonné d'un départ décidé", () => {
  it("rend le dû moins ce qui est parti, sur les seules lignes incomplètes", () => {
    const names = new Map([
      ["CRO", "Croissant"],
      ["PAI", "Baguette"],
    ]);

    expect(
      abandonedOf(
        [
          { sku: "CRO", due: 3, packed: 1 },
          { sku: "PAI", due: 2, packed: 0 },
          { sku: "PAC", due: 4, packed: 4 },
        ],
        names,
        new Map(),
      ),
    ).toEqual([
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" as const },
      { sku: "PAI", productName: "Baguette", quantity: 2, saleUnit: "piece" as const },
    ]);
  });

  it("garde le SKU d'un article que la commande ne nomme pas, plutôt qu'un nom inventé", () => {
    expect(abandonedOf([{ sku: "X", due: 1, packed: 0 }], new Map(), new Map())).toEqual([
      { sku: "X", productName: "X", quantity: 1, saleUnit: "piece" as const },
    ]);
  });
});

describe("printStateOf — l'impression des BL d'un départ décidé", () => {
  it("rien à dire sans BL vivant", () => {
    expect(printStateOf([])).toBeNull();
  });

  it("à imprimer quand un BL n'a jamais été imprimé", () => {
    expect(printStateOf([{ contentVersion: 1, printedVersion: null }])).toBe("to_print");
  });

  it("à imprimer quand un BL a changé depuis son impression", () => {
    expect(
      printStateOf([
        { contentVersion: 2, printedVersion: 2 },
        { contentVersion: 2, printedVersion: 1 },
      ]),
    ).toBe("to_print");
  });

  it("imprimé quand tous le sont à leur version courante", () => {
    expect(printStateOf([{ contentVersion: 2, printedVersion: 2 }])).toBe("printed");
  });
});

describe("decisionMarkOf — la décision dite au poste", () => {
  const at = new Date(1_000);

  it("rend le reste abandonné, l'instant et l'auteur écrit", () => {
    expect(
      decisionMarkOf({ decidedAt: at, decidedByStaffId: "staff_1", remainder: "abandoned" }),
    ).toEqual({ remainder: "abandoned", decidedAt: at, decidedBy: "staff_1" });
  });

  it("ne dit pas « abandonné » d'un autre reste, ni d'une décision absente", () => {
    expect(
      decisionMarkOf({ decidedAt: at, decidedByStaffId: "s", remainder: "to_redeliver" }),
    ).toBeNull();
    expect(decisionMarkOf(null)).toBeNull();
  });

  /** P6 de `pricing/plan-vente-au-poids.md` : le reste d'un lot au poids est des grammes. */
  it("dit le reste d'un article au poids en grammes, avec son unité", () => {
    expect(
      abandonedOf(
        [
          { sku: "SAU", due: 1250, packed: 1000 },
          { sku: "CRO", due: 6, packed: 4 },
        ],
        new Map([
          ["SAU", "Saumon gravlax"],
          ["CRO", "Croissant"],
        ]),
        new Map([
          ["SAU", "weight"],
          ["CRO", "piece"],
        ]),
      ),
    ).toEqual([
      { sku: "SAU", productName: "Saumon gravlax", quantity: 250, saleUnit: "weight" },
      { sku: "CRO", productName: "Croissant", quantity: 2, saleUnit: "piece" },
    ]);
  });

  it("lit en pièces un article dont la commande ne dit pas l'unité (rétrocompatibilité)", () => {
    expect(abandonedOf([{ sku: "X", due: 3, packed: 1 }], new Map(), new Map())).toEqual([
      { sku: "X", productName: "X", quantity: 2, saleUnit: "piece" },
    ]);
  });
});

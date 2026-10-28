import {
  type PackingBinType,
  type PackingCapacity,
  type PackingLine,
  proposePacking,
} from "../propose-packing.js";

/**
 * **Le colisage proposé d'un article au poids** (P6 de
 * `documentation/pricing/plan-vente-au-poids.md`) : sa contenance se lit en
 * grammes, et un lot qui tient dans un bac entier n'est jamais coupé — le
 * colisage refuserait la seconde part (`WeightLotSplitError`).
 *
 * Un seul type, M, cloisonnable : 30 croissants ou 2 000 g de saumon.
 */
const M: PackingBinType = { id: "bin_m", volume: 40, isotherm: false, divisible: true };

const CAPACITIES: readonly PackingCapacity[] = [
  { binTypeId: "bin_m", sku: "CRO", units: 30 },
  { binTypeId: "bin_m", sku: "SAU", units: 2000 },
];

const croissants = (quantity: number): PackingLine => ({
  sku: "CRO",
  quantity,
  requiresCold: false,
  saleUnit: "piece",
});
const salmon = (grams: number): PackingLine => ({
  sku: "SAU",
  quantity: grams,
  requiresCold: false,
  saleUnit: "weight",
});

function shape(lines: readonly PackingLine[]) {
  return proposePacking(lines, [M], CAPACITIES).bins.map(
    ({ whole, half, content, lastContent }) => ({ whole, half, content, lastContent }),
  );
}

describe("proposePacking — un lot au poids tient dans UN bac", () => {
  it("un lot exactement à la capacité : un bac entier", () => {
    expect(shape([salmon(2000)])).toEqual([
      {
        whole: 1,
        half: false,
        content: [{ sku: "SAU", quantity: 2000 }],
        lastContent: [{ sku: "SAU", quantity: 2000 }],
      },
    ]);
  });

  it("un lot d'une demi-capacité tient dans une moitié de bac", () => {
    expect(shape([salmon(1000)])).toMatchObject([{ whole: 0, half: true }]);
  });

  it("une commande mêlée : le lot qui ne tient pas dans le reste du bac part ENTIER au suivant", () => {
    // 24 croissants = 0,8 bac. Coupé, le saumon aurait mis 400 g au premier bac
    // et 850 g dans une moitié ; entier, il demande un second bac plein.
    expect(shape([croissants(24), salmon(1250)])).toEqual([
      {
        whole: 2,
        half: false,
        content: [
          { sku: "CRO", quantity: 24 },
          { sku: "SAU", quantity: 1250 },
        ],
        lastContent: [{ sku: "SAU", quantity: 1250 }],
      },
    ]);
  });

  it("la même quantité à la pièce, elle, se coupe : la règle ne vaut que pour le poids", () => {
    const pieces: PackingLine = { ...salmon(1250), saleUnit: "piece" };

    expect(shape([croissants(24), pieces])).toMatchObject([
      { whole: 1, half: true, lastContent: [{ sku: "SAU", quantity: 850 }] },
    ]);
  });

  it("un lot plus lourd qu'un bac entier se compte en bacs, faute de mieux — et la boucle termine", () => {
    expect(shape([salmon(3000)])).toMatchObject([
      { whole: 1, half: true, content: [{ sku: "SAU", quantity: 3000 }] },
    ]);
  });

  it("deux commandes d'un même lot fusionnées restent un lot", () => {
    expect(shape([salmon(600), salmon(600)])).toMatchObject([
      { whole: 1, half: false, content: [{ sku: "SAU", quantity: 1200 }] },
    ]);
  });
});

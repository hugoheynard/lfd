import {
  type PackingBinType,
  type PackingCapacity,
  type PackingLine,
  proposePacking,
} from "../propose-packing.js";

/** Trois types, du semis : S isotherme rigide, M et L cloisonnables. */
const S: PackingBinType = { id: "bin_s", volume: 20, isotherm: true, divisible: false };
const M: PackingBinType = { id: "bin_m", volume: 40, isotherm: false, divisible: true };
const L: PackingBinType = { id: "bin_l", volume: 60, isotherm: false, divisible: true };
const TYPES = [S, M, L];

const CAPACITIES: readonly PackingCapacity[] = [
  { binTypeId: "bin_m", sku: "CROISSANT", units: 24 },
  { binTypeId: "bin_l", sku: "CROISSANT", units: 40 },
  { binTypeId: "bin_m", sku: "BAGUETTE", units: 12 },
  { binTypeId: "bin_l", sku: "BAGUETTE", units: 20 },
  { binTypeId: "bin_s", sku: "TARTE", units: 4 },
  { binTypeId: "bin_s", sku: "CROISSANT", units: 10 },
];

function dry(sku: string, quantity: number): PackingLine {
  return { sku, quantity, requiresCold: false };
}

function cold(sku: string, quantity: number): PackingLine {
  return { sku, quantity, requiresCold: true };
}

/** La proposition sans son détail : ce que le poste de colisage lit d'abord. */
function summary(lines: readonly PackingLine[], capacities = CAPACITIES, types = TYPES) {
  return proposePacking(lines, types, capacities).bins.map(({ binTypeId, whole, half, cold }) => ({
    binTypeId,
    whole,
    half,
    cold,
  }));
}

describe("le colisage proposé (L4b-C4, v2-3)", () => {
  it("un seul produit qui tient dans un bac : le plus petit qui le prend", () => {
    // 20 croissants : 0,83 d'un M, 0,5 d'un L → la moitié de L (30) bat le M entier (40).
    expect(summary([dry("CROISSANT", 20)])).toEqual([
      { binTypeId: "bin_l", whole: 0, half: true, cold: false },
    ]);
    // 30 croissants : ne tient pas en M ; un L entier.
    expect(summary([dry("CROISSANT", 30)])).toEqual([
      { binTypeId: "bin_l", whole: 1, half: false, cold: false },
    ]);
  });

  it("un reste ≤ 0,5 descend en demi-bac d'un type cloisonnable, plus petit", () => {
    // 50 croissants : un L plein (40), puis 10 = 0,42 d'un M → ½ M.
    const proposal = proposePacking([dry("CROISSANT", 50)], TYPES, CAPACITIES);

    expect(proposal.bins).toEqual([
      {
        binTypeId: "bin_l",
        cold: false,
        whole: 1,
        half: false,
        lastFill: 1,
        lastContent: [{ sku: "CROISSANT", quantity: 40 }],
        content: [{ sku: "CROISSANT", quantity: 40 }],
      },
      {
        binTypeId: "bin_m",
        cold: false,
        whole: 0,
        half: true,
        lastFill: 10 / 24 / 0.5,
        lastContent: [{ sku: "CROISSANT", quantity: 10 }],
        content: [{ sku: "CROISSANT", quantity: 10 }],
      },
    ]);
    expect(proposal.unplaced).toEqual([]);
  });

  it("mélange les produits d'une commande en additionnant leurs places (Q3)", () => {
    // 12 croissants (0,5 M) + 6 baguettes (0,5 M) = un M plein ; en L : 0,6.
    const proposal = proposePacking([dry("CROISSANT", 12), dry("BAGUETTE", 6)], TYPES, CAPACITIES);

    expect(proposal.bins).toHaveLength(1);
    expect(proposal.bins[0]).toMatchObject({ binTypeId: "bin_m", whole: 1, half: false });
    expect(proposal.bins[0]?.lastFill).toBeCloseTo(1);
    expect(proposal.bins[0]?.content).toEqual([
      { sku: "BAGUETTE", quantity: 6 },
      { sku: "CROISSANT", quantity: 12 },
    ]);
  });

  it("sépare le froid du sec : le froid en isotherme, jamais dans le bac du sec", () => {
    expect(summary([cold("TARTE", 3), dry("CROISSANT", 20)])).toEqual([
      { binTypeId: "bin_s", whole: 1, half: false, cold: true },
      { binTypeId: "bin_l", whole: 0, half: true, cold: false },
    ]);
  });

  it("n'utilise un isotherme pour du sec que si aucun autre type ne le contient", () => {
    const capacities = [...CAPACITIES, { binTypeId: "bin_s", sku: "CAKE", units: 5 }];

    expect(summary([dry("CAKE", 2), dry("CROISSANT", 10)], capacities)).toEqual([
      { binTypeId: "bin_m", whole: 0, half: true, cold: false },
      { binTypeId: "bin_s", whole: 1, half: false, cold: false },
    ]);
  });

  it("signale un produit sans contenance, sans le deviner", () => {
    const proposal = proposePacking([dry("INCONNU", 3), dry("CROISSANT", 5)], TYPES, CAPACITIES);

    expect(proposal.unplaced).toEqual([{ sku: "INCONNU", quantity: 3, reason: "no_capacity" }]);
    expect(proposal.bins.map((entry) => entry.binTypeId)).toEqual(["bin_m"]);
  });

  it("signale un produit froid sans type isotherme qui le contienne", () => {
    // Des baguettes déclarées froides : M et L les contiennent, aucun isotherme.
    const proposal = proposePacking([cold("BAGUETTE", 4)], TYPES, CAPACITIES);

    expect(proposal.bins).toEqual([]);
    expect(proposal.unplaced).toEqual([
      { sku: "BAGUETTE", quantity: 4, reason: "cold_without_isotherm" },
    ]);
  });

  it("des contenances à 1 : une unité par bac, jamais en demi-bac, le plus petit type", () => {
    const capacities = [
      { binTypeId: "bin_m", sku: "PIECE", units: 1 },
      { binTypeId: "bin_l", sku: "PIECE", units: 1 },
    ];

    expect(summary([dry("PIECE", 3)], capacities)).toEqual([
      { binTypeId: "bin_m", whole: 3, half: false, cold: false },
    ]);
  });

  it("une grosse commande : le moins de bacs, et rien de perdu", () => {
    const lines = [dry("CROISSANT", 437), dry("BAGUETTE", 121), cold("TARTE", 13)];
    const proposal = proposePacking(lines, TYPES, CAPACITIES);

    const placed = new Map<string, number>();
    for (const entry of proposal.bins) {
      for (const item of entry.content) {
        placed.set(item.sku, (placed.get(item.sku) ?? 0) + item.quantity);
      }
    }
    expect(Object.fromEntries(placed)).toEqual({ CROISSANT: 437, BAGUETTE: 121, TARTE: 13 });
    // Place sèche : 437/40 + 121/20 = 16,98 bacs L → 17 bacs au moins, et on les atteint.
    const dryBins = proposal.bins
      .filter((entry) => !entry.cold)
      .reduce((sum, entry) => sum + entry.whole + (entry.half ? 1 : 0), 0);
    expect(dryBins).toBe(17);
    // Froid : 13 tartes à 4 par bac S → 4 bacs S.
    expect(summary(lines)[0]).toEqual({ binTypeId: "bin_s", whole: 4, half: false, cold: true });
  });

  it("fusionne deux lignes d'un même SKU et ignore une quantité nulle", () => {
    expect(summary([dry("CROISSANT", 10), dry("CROISSANT", 10), dry("BAGUETTE", 0)])).toEqual([
      { binTypeId: "bin_l", whole: 0, half: true, cold: false },
    ]);
  });

  it("est déterministe : l'ordre des lignes ne change pas la proposition", () => {
    const lines = [dry("CROISSANT", 70), dry("BAGUETTE", 9), cold("TARTE", 5)];

    expect(proposePacking([...lines].reverse(), TYPES, CAPACITIES)).toEqual(
      proposePacking(lines, TYPES, CAPACITIES),
    );
  });

  it("une commande vide, ou sans type en service : rien à proposer", () => {
    expect(proposePacking([], TYPES, CAPACITIES)).toEqual({ bins: [], unplaced: [] });
    expect(proposePacking([dry("CROISSANT", 3)], [], CAPACITIES).unplaced).toEqual([
      { sku: "CROISSANT", quantity: 3, reason: "no_capacity" },
    ]);
  });
});

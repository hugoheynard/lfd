import {
  addRateBasisPoints,
  attributeOrders,
  type SuggestionDayAdds,
  type SkuDaySales,
} from "../suggestion-attribution.js";

// Les jours ne sont comparés qu'entre eux : aucune horloge ici.
const DAY = "2026-10-10";
const NEXT = "2026-10-11";

const adds = (claimant: string, added: number, day = DAY, sku = "CAF-001"): SuggestionDayAdds => ({
  claimant,
  day,
  sku,
  added,
});
const sales = (
  quantity: number,
  revenueCents: number,
  day = DAY,
  sku = "CAF-001",
): SkuDaySales => ({
  day,
  sku,
  quantity,
  revenueCents,
});

describe("attributeOrders", () => {
  it("plafonne par les ajouts : 3 ajoutés, 10 commandés → 3", () => {
    const result = attributeOrders([adds("R1", 3)], [sales(10, 1500)]);
    expect(result.get("R1")).toEqual({ orderedEstimate: 3, revenueEstimateCents: 450 });
  });

  it("plafonne par les commandes : 5 ajoutés, 2 commandés → 2", () => {
    const result = attributeOrders([adds("R1", 5)], [sales(2, 300)]);
    expect(result.get("R1")).toEqual({ orderedEstimate: 2, revenueEstimateCents: 300 });
  });

  it("un jour sans ajout n'attribue rien, même s'il a vendu", () => {
    const result = attributeOrders(
      [adds("R1", 2, DAY)],
      [sales(2, 300, DAY), sales(50, 7500, NEXT)],
    );
    expect(result.get("R1")).toEqual({ orderedEstimate: 2, revenueEstimateCents: 300 });
  });

  it("un jour d'ajouts sans commande rend zéro pièce et zéro centime", () => {
    const result = attributeOrders([adds("R1", 4)], []);
    expect(result.get("R1")).toEqual({ orderedEstimate: 0, revenueEstimateCents: 0 });
  });

  it("ne compte pas deux fois la même pièce : deux règles se partagent le plafond au prorata", () => {
    // 3 + 1 ajouts pour 2 commandés : 1,5 et 0,5 → le plus fort reste à égalité, l'id le plus petit.
    const result = attributeOrders([adds("R2", 1), adds("R1", 3)], [sales(2, 400)]);
    const total =
      (result.get("R1")?.orderedEstimate ?? 0) + (result.get("R2")?.orderedEstimate ?? 0);
    expect(total).toBe(2);
    expect(result.get("R1")).toEqual({ orderedEstimate: 2, revenueEstimateCents: 400 });
    expect(result.get("R2")).toEqual({ orderedEstimate: 0, revenueEstimateCents: 0 });
  });

  it("chaque règle garde ses ajouts quand le plafond suffit à toutes", () => {
    const result = attributeOrders([adds("R1", 1), adds("R2", 2)], [sales(10, 2000)]);
    expect(result.get("R1")?.orderedEstimate).toBe(1);
    expect(result.get("R2")?.orderedEstimate).toBe(2);
  });

  it("le prix est le HT moyen payé ce jour-là, en centimes entiers arrondis", () => {
    // 3 pièces pour 1000 c : 333,33… c la pièce ; 2 pièces → 666,67 → 667 c.
    const result = attributeOrders([adds("R1", 2)], [sales(3, 1000)]);
    expect(result.get("R1")).toEqual({ orderedEstimate: 2, revenueEstimateCents: 667 });
    expect(Number.isInteger(result.get("R1")?.revenueEstimateCents)).toBe(true);
  });

  it("additionne les jours et les articles d'une même règle", () => {
    const result = attributeOrders(
      [adds("R1", 1, DAY), adds("R1", 1, NEXT), adds("R1", 2, DAY, "PAI-001")],
      [sales(1, 150, DAY), sales(1, 170, NEXT), sales(4, 1200, DAY, "PAI-001")],
    );
    expect(result.get("R1")).toEqual({ orderedEstimate: 4, revenueEstimateCents: 920 });
  });
});

describe("attributeOrders — le staff et le calculé dans le même partage", () => {
  // Les ids de règle sont des ULID, le calculé une clé préfixée : jamais la même.
  const BOUGHT_WITH = "data:bought_with";
  const USUALS = "data:usuals";

  it("une règle et le calculé, une pièce commandée : une seule pièce attribuée, pas deux", () => {
    const result = attributeOrders([adds("R1", 1), adds(BOUGHT_WITH, 1)], [sales(1, 150)]);
    const total =
      (result.get("R1")?.orderedEstimate ?? 0) + (result.get(BOUGHT_WITH)?.orderedEstimate ?? 0);
    expect(total).toBe(1);
    // À égalité de reste, la clé la plus petite au sens de `localeCompare` : « data:… » avant « R1 ».
    expect(result.get(BOUGHT_WITH)).toEqual({ orderedEstimate: 1, revenueEstimateCents: 150 });
    expect(result.get("R1")).toEqual({ orderedEstimate: 0, revenueEstimateCents: 0 });
  });

  it("partage au prorata et au plus fort reste entre une règle et deux genres du calculé", () => {
    // 1 + 3 + 2 ajouts pour 4 pièces : 0,67 / 2 / 1,33 → 0 / 2 / 1, une pièce au plus fort reste (R1).
    const result = attributeOrders(
      [adds("R1", 1), adds(BOUGHT_WITH, 3), adds(USUALS, 2)],
      [sales(4, 800)],
    );
    expect(result.get("R1")?.orderedEstimate).toBe(1);
    expect(result.get(BOUGHT_WITH)?.orderedEstimate).toBe(2);
    expect(result.get(USUALS)?.orderedEstimate).toBe(1);
  });

  it("le calculé seul se chiffre comme une règle", () => {
    const result = attributeOrders([adds(USUALS, 3)], [sales(2, 300)]);
    expect(result.get(USUALS)).toEqual({ orderedEstimate: 2, revenueEstimateCents: 300 });
  });

  it("la règle seule garde sa part : rien du calculé ce jour-là ne la réduit", () => {
    const result = attributeOrders(
      [adds("R1", 2), adds(BOUGHT_WITH, 5, NEXT)],
      [sales(2, 300), sales(1, 150, NEXT)],
    );
    expect(result.get("R1")).toEqual({ orderedEstimate: 2, revenueEstimateCents: 300 });
    expect(result.get(BOUGHT_WITH)).toEqual({ orderedEstimate: 1, revenueEstimateCents: 150 });
  });
});

describe("addRateBasisPoints", () => {
  it("rend ajoutées ÷ affichées en points de base, arrondi", () => {
    expect(addRateBasisPoints(1, 8)).toBe(1250);
    expect(addRateBasisPoints(1, 3)).toBe(3333);
    expect(addRateBasisPoints(2, 3)).toBe(6667);
  });

  it("n'invente pas de taux sans affichage", () => {
    expect(addRateBasisPoints(0, 0)).toBeNull();
  });
});

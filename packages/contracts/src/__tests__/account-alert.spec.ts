import {
  ALERT_KINDS,
  alertThresholdTiersSchema,
  thresholdForBaseline,
  type AlertThresholdTier,
} from "../account-alert.js";

const TIERS: AlertThresholdTier[] = [
  { upToQuantity: 2, thresholdPercent: 400 },
  { upToQuantity: 10, thresholdPercent: 200 },
  { upToQuantity: null, thresholdPercent: 30 },
];

describe("thresholdForBaseline", () => {
  it("prend le premier palier qui couvre la norme, bornes incluses", () => {
    expect(thresholdForBaseline(TIERS, 1)).toBe(400);
    expect(thresholdForBaseline(TIERS, 2)).toBe(400);
    expect(thresholdForBaseline(TIERS, 3)).toBe(200);
    expect(thresholdForBaseline(TIERS, 10)).toBe(200);
  });

  it("retombe sur le palier ouvert au-delà du dernier seuil", () => {
    // Le point du modèle : sur un produit pris par 100, un ×5 ne doit PAS être
    // toléré sous prétexte qu'il l'est sur un produit pris à l'unité.
    expect(thresholdForBaseline(TIERS, 100)).toBe(30);
    expect(thresholdForBaseline(TIERS, 10_000)).toBe(30);
  });

  it("rend null plutôt qu'un seuil inventé quand il n'y a aucun palier", () => {
    expect(thresholdForBaseline([], 5)).toBeNull();
  });

  it("couvre toute norme avec les paliers livrés par défaut", () => {
    const defaults = ALERT_KINDS["product.quantity_outlier"].defaults.params;
    if (defaults.kind !== "product.quantity_outlier") {
      throw new Error("les défauts du type ne portent pas ses propres paramètres");
    }
    for (const baseline of [1, 7, 42, 999]) {
      expect(thresholdForBaseline(defaults.tiers, baseline)).not.toBeNull();
    }
  });
});

describe("alertThresholdTiersSchema", () => {
  it("accepte des paliers croissants terminés par un palier ouvert", () => {
    expect(alertThresholdTiersSchema.safeParse(TIERS).success).toBe(true);
  });

  it("refuse un dernier palier borné — les gros volumes ne seraient couverts par rien", () => {
    const bounded = [{ upToQuantity: 10, thresholdPercent: 50 }];

    expect(alertThresholdTiersSchema.safeParse(bounded).success).toBe(false);
  });

  it("refuse un palier ouvert ailleurs qu'en dernier", () => {
    const misplaced = [
      { upToQuantity: null, thresholdPercent: 400 },
      { upToQuantity: 10, thresholdPercent: 200 },
    ];

    expect(alertThresholdTiersSchema.safeParse(misplaced).success).toBe(false);
  });

  it("refuse des bornes non strictement croissantes", () => {
    const flat = [
      { upToQuantity: 10, thresholdPercent: 400 },
      { upToQuantity: 10, thresholdPercent: 200 },
      { upToQuantity: null, thresholdPercent: 30 },
    ];

    expect(alertThresholdTiersSchema.safeParse(flat).success).toBe(false);
  });

  it("refuse une échelle vide", () => {
    expect(alertThresholdTiersSchema.safeParse([]).success).toBe(false);
  });
});

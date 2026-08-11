import {
  alertParamsSchema,
  dropTiersSchema,
  riseTiersSchema,
  thresholdForBaseline,
  type AlertThresholdTier,
} from "../account-alert.js";
import { ALERT_KINDS, ALERT_KIND_ORDER, alertRuleSchema } from "../account-alert-rule.js";

const TIERS: AlertThresholdTier[] = [
  { upToQuantity: 2, thresholdPercent: 400 },
  { upToQuantity: 10, thresholdPercent: 200 },
  { upToQuantity: null, thresholdPercent: 30 },
];

describe("thresholdForBaseline", () => {
  it("prend le premier palier qui couvre la référence, bornes incluses", () => {
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

  it("accepte une référence fractionnaire — une moyenne n'est pas un entier", () => {
    expect(thresholdForBaseline(TIERS, 2.5)).toBe(200);
  });

  it("rend null plutôt qu'un seuil inventé quand il n'y a aucun palier", () => {
    expect(thresholdForBaseline([], 5)).toBeNull();
  });

  it("couvre toute référence avec les échelles livrées par défaut", () => {
    for (const kind of ALERT_KIND_ORDER) {
      const params = ALERT_KINDS[kind].defaults.params;
      if (!("riseTiers" in params)) {
        continue;
      }
      for (const baseline of [1, 7, 42, 999]) {
        expect(thresholdForBaseline(params.riseTiers, baseline)).not.toBeNull();
      }
    }
  });
});

describe("échelles de seuil", () => {
  it("accepte des paliers croissants terminés par un palier ouvert", () => {
    expect(riseTiersSchema.safeParse(TIERS).success).toBe(true);
  });

  it("refuse un dernier palier borné — les gros volumes ne seraient couverts par rien", () => {
    expect(riseTiersSchema.safeParse([{ upToQuantity: 10, thresholdPercent: 50 }]).success).toBe(
      false,
    );
  });

  it("refuse un palier ouvert ailleurs qu'en dernier", () => {
    const misplaced = [
      { upToQuantity: null, thresholdPercent: 400 },
      { upToQuantity: 10, thresholdPercent: 200 },
    ];

    expect(riseTiersSchema.safeParse(misplaced).success).toBe(false);
  });

  it("refuse des bornes non strictement croissantes", () => {
    const flat = [
      { upToQuantity: 10, thresholdPercent: 400 },
      { upToQuantity: 10, thresholdPercent: 200 },
      { upToQuantity: null, thresholdPercent: 30 },
    ];

    expect(riseTiersSchema.safeParse(flat).success).toBe(false);
  });

  it("refuse une échelle vide", () => {
    expect(riseTiersSchema.safeParse([]).success).toBe(false);
  });

  /**
   * Régression : l'échelle de BAISSE partageait le barème de hausse, si bien
   * qu'un seuil > 100 % rendait la baisse structurellement indétectable — une
   * baisse ne peut pas dépasser 100 %, et n'atteint même jamais ce plafond.
   */
  it("refuse un seuil de baisse au-delà de 99 % — une baisse y est impossible", () => {
    expect(dropTiersSchema.safeParse([{ upToQuantity: null, thresholdPercent: 200 }]).success).toBe(
      false,
    );
    expect(dropTiersSchema.safeParse([{ upToQuantity: null, thresholdPercent: 100 }]).success).toBe(
      false,
    );
    expect(dropTiersSchema.safeParse([{ upToQuantity: null, thresholdPercent: 99 }]).success).toBe(
      true,
    );
  });

  it("garde la baisse atteignable sur les petits volumes livrés par défaut", () => {
    const drift = ALERT_KINDS["product.quantity_drift"].defaults.params;
    if (drift.kind !== "product.quantity_drift") {
      throw new Error("les défauts ne portent pas leurs propres paramètres");
    }
    // Une moyenne de 2 ne peut baisser que de 50 % (2 → 1). Le palier qui la
    // couvre doit donc être ≤ 50, sinon l'option « baisse » ment.
    const atTwo = thresholdForBaseline(drift.dropTiers, 2);
    expect(atTwo).not.toBeNull();
    expect(atTwo ?? 100).toBeLessThanOrEqual(50);
  });
});

describe("alertRuleSchema — l'affichage client est gardé côté serveur", () => {
  /**
   * Régression : l'invariant ne vivait que dans un `@if` de template, si bien
   * qu'un PUT direct suffisait à faire parler au client un type qui n'a rien à
   * lui dire.
   */
  it("refuse customerVisible sur un type non montrable au client", () => {
    for (const kind of ALERT_KIND_ORDER.filter((k) => !ALERT_KINDS[k].customerShowable)) {
      const rule = {
        ...ALERT_KINDS[kind].defaults,
        delivery: { staffInApp: false, staffEmail: false, customerVisible: true },
      };

      expect(alertRuleSchema.safeParse(rule).success).toBe(false);
    }
  });

  it("l'accepte sur l'écart à sa propre moyenne — le seul qui parle DE lui", () => {
    const rule = {
      ...ALERT_KINDS["product.quantity_drift"].defaults,
      delivery: { staffInApp: false, staffEmail: false, customerVisible: true },
    };

    expect(alertRuleSchema.safeParse(rule).success).toBe(true);
  });

  it("aucun défaut livré ne parle au client sans qu'on l'ait décidé", () => {
    for (const kind of ALERT_KIND_ORDER) {
      expect(ALERT_KINDS[kind].defaults.delivery.customerVisible).toBe(false);
    }
  });

  it("chaque type se relit lui-même — les défauts sont des règles valides", () => {
    for (const kind of ALERT_KIND_ORDER) {
      const parsed = alertRuleSchema.safeParse(ALERT_KINDS[kind].defaults);
      expect(parsed.success).toBe(true);
      expect(alertParamsSchema.safeParse(ALERT_KINDS[kind].defaults.params).success).toBe(true);
    }
  });
});

describe("subscription.changed", () => {
  it("refuse une règle qui ne surveille aucune facette", () => {
    const blind = {
      kind: "subscription.changed",
      watchQuantities: false,
      watchRecurrence: false,
      watchFulfillment: false,
    };

    expect(alertParamsSchema.safeParse(blind).success).toBe(false);
  });

  it("n'est pas déclenché par une commande", () => {
    // Le seul type dont le fait générateur est ailleurs : l'évaluation à la
    // commande doit pouvoir l'écarter sans liste écrite en dur.
    expect(ALERT_KINDS["subscription.changed"].triggeredByOrder).toBe(false);
    expect(ALERT_KINDS["product.quantity_drift"].triggeredByOrder).toBe(true);
  });
});

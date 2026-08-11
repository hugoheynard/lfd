import { ALERT_KINDS, type AlertKind, type AlertRule } from "@lfd/contracts";

import type { AlertEvaluationContext } from "../detectors/context.js";
import { median } from "../detectors/deviation.js";
import { detectFirstOrder } from "../detectors/first-order.js";
import { detectQuantityDrift } from "../detectors/quantity-drift.js";
import { detectQuantityOutlier } from "../detectors/quantity-outlier.js";
import { missingOrderDetectors } from "../detectors/registry.js";
import { alertIdempotencyKey, evaluateOrder } from "../evaluate-order.js";

const SKU = "VIE-001";

function params<K extends AlertKind>(kind: K): Extract<AlertRule["params"], { kind: K }> {
  return ALERT_KINDS[kind].defaults.params as Extract<AlertRule["params"], { kind: K }>;
}

function context(overrides: Partial<AlertEvaluationContext> = {}): AlertEvaluationContext {
  return {
    lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 10 }],
    history: new Map(),
    everOrdered: new Set(),
    previousOrderCount: 5,
    norms: new Map(),
    ...overrides,
  };
}

describe("median", () => {
  it("prend la valeur du milieu, et la moyenne des deux milieux si pair", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("résiste à l'aberration qu'on cherche — ce que la moyenne ne fait pas", () => {
    // Le cas qui a décidé du choix : une faute de frappe à 500 passée une fois
    // déplacerait une moyenne (≈ 84) au point d'éteindre la détection suivante.
    expect(median([4, 5, 4, 6, 5, 500])).toBe(5);
  });

  it("rend null sur un échantillon vide plutôt qu'un zéro trompeur", () => {
    expect(median([])).toBeNull();
  });
});

describe("product.first_order", () => {
  it("se tait tant que le compte n'a pas assez de commandes derrière lui", () => {
    // Sur la toute première commande, tout est nouveau : 20 lignes = 20 alertes,
    // donc zéro signal.
    const findings = detectFirstOrder(
      context({ previousOrderCount: 0 }),
      params("product.first_order"),
    );

    expect(findings).toHaveLength(0);
  });

  it("signale un SKU jamais commandé", () => {
    const findings = detectFirstOrder(context(), params("product.first_order"));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.sku).toBe(SKU);
    expect(findings[0]?.baseline).toBeNull();
  });

  /**
   * Régression : confondre « hors fenêtre récente » et « jamais pris » ferait
   * crier « nouveau produit » sur un habitué de longue date.
   */
  it("ne signale pas un produit pris il y a longtemps, hors fenêtre de dérive", () => {
    const findings = detectFirstOrder(
      context({ everOrdered: new Set([SKU]), history: new Map() }),
      params("product.first_order"),
    );

    expect(findings).toHaveLength(0);
  });
});

describe("product.quantity_drift", () => {
  const DRIFT = params("product.quantity_drift");

  it("se tait sous le plancher de moyenne", () => {
    const findings = detectQuantityDrift(context({ history: new Map([[SKU, [4, 4]]]) }), DRIFT);

    expect(findings).toHaveLength(0);
  });

  it("signale une hausse au-delà du palier de sa moyenne", () => {
    // Moyenne 4 → palier ≤ 10 → 100 %. 10 contre 4 = +150 %.
    const findings = detectQuantityDrift(context({ history: new Map([[SKU, [4, 4, 4]]]) }), DRIFT);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.baseline).toBe(4);
    expect(findings[0]?.deviationPercent).toBe(150);
  });

  it("ne signale pas une variation ordinaire", () => {
    // Moyenne 8 → palier ≤ 10 → 100 %. 10 contre 8 = +25 %.
    const findings = detectQuantityDrift(context({ history: new Map([[SKU, [8, 8, 8]]]) }), DRIFT);

    expect(findings).toHaveLength(0);
  });

  /**
   * Régression : la baisse partageait le barème de hausse. Avec un palier à
   * 200 %, un client passant de 8 à 1 ne déclenchait RIEN — une baisse ne peut
   * pas dépasser 100 %.
   */
  it("signale une baisse de moitié sur un petit volume", () => {
    const findings = detectQuantityDrift(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 1 }],
        history: new Map([[SKU, [2, 2, 2]]]),
      }),
      DRIFT,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.deviationPercent).toBe(-50);
  });

  it("respecte le sens surveillé", () => {
    const drop = context({
      lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 1 }],
      history: new Map([[SKU, [2, 2, 2]]]),
    });

    expect(detectQuantityDrift(drop, { ...DRIFT, direction: "up" })).toHaveLength(0);
    expect(detectQuantityDrift(drop, { ...DRIFT, direction: "down" })).toHaveLength(1);
  });

  it("ne signale rien quand la quantité est exactement la moyenne", () => {
    const findings = detectQuantityDrift(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 4 }],
        history: new Map([[SKU, [4, 4, 4]]]),
      }),
      DRIFT,
    );

    expect(findings).toHaveLength(0);
  });

  it("ne garde que les N dernières commandes pour la moyenne", () => {
    // baselineOrders = 6 : les deux premières valeurs sont hors fenêtre, la
    // moyenne vaut 4 et non 22 — sinon 10 passerait pour une chute.
    const findings = detectQuantityDrift(
      context({ history: new Map([[SKU, [100, 100, 4, 4, 4, 4, 4, 4]]]) }),
      DRIFT,
    );

    expect(findings[0]?.baseline).toBe(4);
  });
});

describe("product.quantity_outlier", () => {
  const OUTLIER = params("product.quantity_outlier");
  const NORMS = new Map([[SKU, { medianQuantity: 4, sampleLines: 40 }]]);

  it("se tait quand l'échantillon du produit est trop maigre", () => {
    const thin = new Map([[SKU, { medianQuantity: 4, sampleLines: 3 }]]);

    expect(detectQuantityOutlier(context({ norms: thin }), OUTLIER)).toHaveLength(0);
  });

  it("signale une aberration sur une première commande", () => {
    // Médiane 4 → palier ≤ 10 → 200 %. 500 contre 4, c'est le 5 tapé 500.
    const findings = detectQuantityOutlier(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 500 }],
        norms: NORMS,
        previousOrderCount: 0,
      }),
      OUTLIER,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.baseline).toBe(4);
  });

  it("laisse la main à la moyenne du compte dès qu'il en a une", () => {
    // Deux points font une habitude : la référence du compte est plus fine, les
    // deux règles ne doivent pas crier pour un même écart.
    const findings = detectQuantityOutlier(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 500 }],
        norms: NORMS,
        history: new Map([[SKU, [4, 4]]]),
      }),
      OUTLIER,
    );

    expect(findings).toHaveLength(0);
  });

  it("surveille quand même le compte connu si on décoche la restriction", () => {
    const findings = detectQuantityOutlier(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 500 }],
        norms: NORMS,
        history: new Map([[SKU, [4, 4]]]),
      }),
      { ...OUTLIER, onlyWithoutAccountBaseline: false },
    );

    expect(findings).toHaveLength(1);
  });

  it("ignore une quantité inférieure à la norme — un essai n'est pas un incident", () => {
    const findings = detectQuantityOutlier(
      context({
        lines: [{ sku: SKU, productName: "Viennoiserie", quantity: 1 }],
        norms: NORMS,
        previousOrderCount: 0,
      }),
      OUTLIER,
    );

    expect(findings).toHaveLength(0);
  });
});

describe("evaluateOrder", () => {
  const rules = (kinds: AlertKind[]): Map<AlertKind, AlertRule> =>
    new Map(kinds.map((kind) => [kind, ALERT_KINDS[kind].defaults]));

  it("rend UNE alerte par type, portant toutes les lignes concernées", () => {
    // Le cap de bruit : quinze nouveaux produits font une alerte, pas quinze.
    const lines = Array.from({ length: 15 }, (_, index) => ({
      sku: `NEW-${index}`,
      productName: `Produit ${index}`,
      quantity: 1,
    }));

    const drafts = evaluateOrder(context({ lines }), rules(["product.first_order"]));

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.findings).toHaveLength(15);
  });

  it("n'émet rien pour une règle éteinte", () => {
    const off = new Map<AlertKind, AlertRule>([
      ["product.first_order", { ...ALERT_KINDS["product.first_order"].defaults, enabled: false }],
    ]);

    expect(evaluateOrder(context(), off)).toHaveLength(0);
  });

  it("écarte les types dont le fait générateur n'est pas une commande", () => {
    const drafts = evaluateOrder(context(), rules(["subscription.changed"]));

    expect(drafts).toHaveLength(0);
  });

  it("n'émet pas d'alerte vide", () => {
    const drafts = evaluateOrder(
      context({ everOrdered: new Set([SKU]) }),
      rules(["product.first_order"]),
    );

    expect(drafts).toHaveLength(0);
  });

  it("la clé d'idempotence ne dépend PAS des seuils", () => {
    // Réévaluer une commande après un ajustement de réglage ne doit pas
    // repeupler l'historique.
    expect(alertIdempotencyKey("product.quantity_drift", "order_1")).toBe(
      "product.quantity_drift:order_1",
    );
  });
});

describe("le registre couvre le contrat", () => {
  /**
   * Sans ce test, ajouter un type au contrat en oubliant son détecteur
   * produirait une règle réglable à l'écran qui ne détecte rien — le pire des
   * deux mondes, puisqu'on la croirait active.
   */
  it("tout type déclenché par une commande a son détecteur", () => {
    expect(missingOrderDetectors()).toEqual([]);
  });
});

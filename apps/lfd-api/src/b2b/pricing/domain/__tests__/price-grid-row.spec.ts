import { ttcCentsFromHtMillicents } from "@lfd/money";

import { admittedPromotion } from "../../../promotions/domain/__tests__/live-promotion.fixture.js";
import {
  priceGridRowOf,
  type PriceGridArticle,
  type RetainedBasketPromotion,
} from "../price-grid-row.js";

/**
 * **Une ligne de la grille de prix** (`plan-export-grille-de-prix.md`, § 5) —
 * pure : la remise au panier passe par la règle de la caisse
 * (`outcomeOf`, `chooseBasketPromotion`, `chainBasketDiscounts`), jamais par un
 * calcul de la grille.
 */

const CROISSANT = "VIE-001-1";

function article(overrides: Partial<PriceGridArticle> = {}): PriceGridArticle {
  return {
    sku: CROISSANT,
    familyName: "Viennoiseries",
    productName: "Croissant",
    variantName: "Croissant pur beurre",
    saleUnit: "piece",
    vatRate: 5.5,
    baseMillicents: 150_000,
    displayedMillicents: 120_000,
    sealing: null,
    enteredPerKg: { proHtMillicents: null, publicTtcCents: null },
    ...overrides,
  };
}

const AT_PICKUP = { kind: "basket", pickup: "all", delivery: "none" } as const;

function retained(
  part: RetainedBasketPromotion["part"],
  overrides: Parameters<typeof admittedPromotion>[0] = {},
): RetainedBasketPromotion {
  return {
    promotion: admittedPromotion({ id: `panier_${part}`, fulfillment: AT_PICKUP, ...overrides }),
    part,
  };
}

const NO_CLASSIFICATIONS = new Map();

describe("une ligne de la grille de prix", () => {
  it("un pro lit des HT : le tarif et le prix affiché, au centime d'une unité", () => {
    const row = priceGridRowOf(article(), [], NO_CLASSIFICATIONS, "ht");

    expect(row).toMatchObject({ baseCents: 150, displayedCents: 120, netCents: 120 });
    expect(row.columns).toEqual([]);
  });

  it("un particulier lit des TTC : la valeur que son rayon affiche", () => {
    const row = priceGridRowOf(article(), [], NO_CLASSIFICATIONS, "ttc");

    expect(row.baseCents).toBe(ttcCentsFromHtMillicents(150_000, 5.5));
    expect(row.displayedCents).toBe(ttcCentsFromHtMillicents(120_000, 5.5));
  });

  it("une remise en colonne à part : son ajustement sur l'article concerné, le net inchangé", () => {
    const row = priceGridRowOf(article(), [retained("column")], NO_CLASSIFICATIONS, "ht");

    expect(row.columns).toEqual([{ mode: "percent", bp: 2000 }]);
    expect(row.netCents).toBe(120);
  });

  it("un article exclu de la remise : cellule vide, pas zéro", () => {
    const excluded = retained("column", {
      scope: {
        mode: "all_except",
        rules: [{ target: "variant", targetId: CROISSANT, eligible: false, targetRank: null }],
      },
    });

    const row = priceGridRowOf(article(), [excluded], NO_CLASSIFICATIONS, "ht");

    expect(row.columns).toEqual([null]);
  });

  it("une remise dans le prix net estimé : appliquée à l'unité, par la chaîne de la caisse", () => {
    const row = priceGridRowOf(article(), [retained("net")], NO_CLASSIFICATIONS, "ht");

    // 20 % de 1,20 € HT = 0,24 €.
    expect(row.netCents).toBe(96);
    expect(row.columns).toEqual([]);
  });

  it("au net, un particulier se remise sur son TTC (chemin `exact_ht`)", () => {
    const row = priceGridRowOf(article(), [retained("net")], NO_CLASSIFICATIONS, "ttc");
    const ttc = ttcCentsFromHtMillicents(120_000, 5.5);

    expect(row.netCents).toBe(ttc - Math.round(ttc * 0.2));
  });

  it("deux remises non cumulables au net : la caisse n'en garde qu'une", () => {
    const tenPercent = retained("net", {
      id: "dix",
      effect: { kind: "percent_off", basisPoints: 1000 },
    });
    const twentyPercent = retained("net", { id: "vingt" });

    const row = priceGridRowOf(article(), [tenPercent, twentyPercent], NO_CLASSIFICATIONS, "ht");

    expect(row.netCents).toBe(96);
  });

  it("un article au poids : les prix s'entendent au kilo", () => {
    const row = priceGridRowOf(
      article({ saleUnit: "weight", baseMillicents: 2_400_000, displayedMillicents: 2_000_000 }),
      [retained("net")],
      NO_CLASSIFICATIONS,
      "ht",
    );

    expect(row).toMatchObject({
      saleUnit: "weight",
      baseCents: 2400,
      displayedCents: 2000,
      netCents: 1600,
    });
  });

  it("le prix au kilo SAISI : celui de l'assiette, ou rien", () => {
    const entered = { proHtMillicents: 1_234_560, publicTtcCents: 1590 };

    expect(
      priceGridRowOf(article({ enteredPerKg: entered }), [], NO_CLASSIFICATIONS, "ht")
        .enteredPerKgCents,
    ).toBe(1235);
    expect(
      priceGridRowOf(article({ enteredPerKg: entered }), [], NO_CLASSIFICATIONS, "ttc")
        .enteredPerKgCents,
    ).toBe(1590);
    expect(priceGridRowOf(article(), [], NO_CLASSIFICATIONS, "ht").enteredPerKgCents).toBeNull();
  });

  describe("sous une mercuriale (`plan-la-mercuriale-decide.md`)", () => {
    it("« Aucune » : la remise ne touche pas l'article que la mercuriale fixe", () => {
      const sealed = article({
        sealing: { mercurialeId: "merc_1", admission: { mode: "none", promotionIds: [] } },
      });

      const row = priceGridRowOf(
        sealed,
        [retained("column"), retained("net")],
        NO_CLASSIFICATIONS,
        "ht",
      );

      expect(row.columns).toEqual([null]);
      expect(row.netCents).toBe(120);
    });

    it("« Au choix » : la promotion choisie passe, une autre non", () => {
      const sealed = article({
        sealing: {
          mercurialeId: "merc_1",
          admission: { mode: "selected", promotionIds: ["panier_column"] },
        },
      });

      const row = priceGridRowOf(
        sealed,
        [retained("column"), retained("net")],
        NO_CLASSIFICATIONS,
        "ht",
      );

      expect(row.columns).toEqual([{ mode: "percent", bp: 2000 }]);
      expect(row.netCents).toBe(120);
    });
  });
});

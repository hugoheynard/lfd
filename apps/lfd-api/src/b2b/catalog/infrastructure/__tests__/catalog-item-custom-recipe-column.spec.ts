import { CatalogProductChangedFact } from "../../../../pim/channels/b2b-platform/products/catalog-product-changed.fact.js";
import { receivedProductOf } from "../../application/handlers/catalog-fact-mapping.js";
import { pimFactsColumns } from "../catalog-item-columns.js";
import { itemUpsertStatements } from "../catalog-item-upsert.js";

/**
 * **Le sur mesure, du fait reçu à la colonne** (fil v17,
 * `plan-articles-sur-mesure.md` § 13, D1 et 13.6-4).
 *
 * Payloads écrits À LA MAIN, tels qu'ils dorment en boîte d'envoi. Ce que ces
 * cas tiennent : un fait qui porte le champ l'écrit ; un fait d'AVANT la v17
 * ne l'écrit ni à la création ni au conflit — la colonne reste celle que la
 * migration de report a posée.
 */

const EMITTED = "2030-01-01T09:00:00.000Z";

const FAMILY = {
  id: "fam_1",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
  audience: "both",
  archived: false,
};

const VARIANT = {
  id: "var_1",
  sku: "VIE-1-1",
  name: "Croissant",
  priceMillicents: 100_000,
  publicTtcCents: 120,
  publicByContext: { takeaway: { vatRatePercent: 5.5, htMillicents: 113_744 } },
  weightGrams: 60,
  isDefault: true,
  position: 0,
  vatRatePercent: 5.5,
  allergens: ["UW"],
  allergenLabels: { labels: [{ category: "gluten", label: "Gluten" }], incomplete: false },
};

const PRODUCT = {
  id: "prd_1",
  sku: "VIE-1",
  name: "Croissant",
  categoryId: FAMILY.id,
  kind: "daily",
  note: null,
  image: null,
  thumbnail: null,
  operationOnly: false,
  requiresCold: false,
};

function received(product: Readonly<Record<string, unknown>>) {
  const fact = CatalogProductChangedFact.fromPayload({
    productId: "prd_1",
    seq: 7,
    emittedAt: EMITTED,
    status: "active",
    audience: "both",
    audienceInherited: true,
    product: { ...PRODUCT, ...product },
    variants: [VARIANT],
    gaps: {},
    family: FAMILY,
  });
  const [item] = receivedProductOf(fact).items;
  if (item === undefined) {
    throw new RangeError("le fait de test porte une déclinaison");
  }
  return item;
}

function statementOf(product: Readonly<Record<string, unknown>>) {
  const item = received(product);
  const [statement] = itemUpsertStatements([{ sku: item.sku, ...pimFactsColumns(item) }]);
  return statement;
}

describe("le sur mesure, du fait à `catalog_items.custom_recipe`", () => {
  it("un fait v17 écrit la colonne, à la création comme au conflit", () => {
    const statement = statementOf({ customRecipe: true });

    expect(received({ customRecipe: true }).customRecipe).toBe(true);
    expect(statement?.sql).toContain('"custom_recipe"');
    expect(statement?.sql).toContain('"custom_recipe" = EXCLUDED."custom_recipe"');
    expect(statement?.values).toContain(true);
  });

  it("`false` s'écrit aussi : décocher la fiche rouvre l'article", () => {
    expect(statementOf({ customRecipe: false })?.sql).toContain(
      '"custom_recipe" = EXCLUDED."custom_recipe"',
    );
  });

  /**
   * 13.6-4 (vitruve, 2026-11-02) : lu `false`, un fait resté en boîte avant le
   * déploiement réécrivait une fiche reportée par la migration, et l'article
   * sortait de S3 — servi au public.
   */
  it("un fait d'avant la v17 laisse la colonne intacte", () => {
    expect(received({}).customRecipe).toBeUndefined();
    expect(pimFactsColumns(received({}))).not.toHaveProperty("customRecipe");
    expect(statementOf({})?.sql).not.toContain("custom_recipe");
  });
});

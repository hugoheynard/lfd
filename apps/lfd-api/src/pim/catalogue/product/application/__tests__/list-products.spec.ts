import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import type { Category } from "../../../category/domain/entities/category.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { ListProductsHandler } from "../list-products.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneCategory,
  OneProduct,
  SELLABLE_VARIANT,
  bareVariant,
  family,
  tarte,
} from "./audience-doubles.js";
import { FixedCitedAllergens } from "../../domain/ports/__tests__/fixed-cited-allergens.js";
import { FixedIllustratedProducts } from "../../domain/ports/__tests__/fixed-illustrated-products.js";
import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";
import { DirectPimContents } from "../../../../changes/application/__tests__/direct-pim-contents.js";

/** Le handler de liste, avec taux et contextes doublés. */
function listing(
  product: ProductSnapshot,
  category: Category | null,
  illustrated: readonly string[] = [],
): ListProductsHandler {
  return new ListProductsHandler(
    new OneProduct(product),
    new OneCategory(category),
    new FixedVatPercents(BOTH_RATES),
    new FixedActiveContexts(["b2b", "takeaway"]),
    new FixedCitedAllergens(),
    new FixedIllustratedProducts(illustrated),
    new DirectPimContents(),
  );
}

/** Le filtre « Sans image » du catalogue lit ce drapeau (2026-10-28). */
describe("ListProductsHandler — les images", () => {
  it("dit qu'une fiche sans image n'est pas illustrée", async () => {
    const [item] = await listing(tarte(), family("pro")).execute();

    expect(item?.illustrated).toBe(false);
  });

  it("dit qu'une fiche qui porte une image est illustrée", async () => {
    const product = tarte();
    const [item] = await listing(product, family("pro"), [product.id]).execute();

    expect(item?.illustrated).toBe(true);
  });
});

/** La liste rend l'audience effective et sa provenance (1d du plan d'audience). */
describe("ListProductsHandler — l'audience", () => {
  it("rend l'audience de la famille quand la fiche hérite", async () => {
    const handler = listing(tarte(), family("pro"));

    const [item] = await handler.execute();

    expect(item).toMatchObject({
      audience: null,
      effectiveAudience: "pro",
      audienceInherited: true,
    });
  });

  it("rend l'audience propre de la fiche quand elle déroge", async () => {
    const handler = listing(tarte({ audience: "public" }), family("pro"));

    const [item] = await handler.execute();

    expect(item).toMatchObject({
      audience: "public",
      effectiveAudience: "public",
      audienceInherited: false,
    });
  });

  it("refuse une fiche rattachée à une famille inconnue", async () => {
    const handler = listing(tarte(), null);

    await expect(handler.execute()).rejects.toBeInstanceOf(CategoryNotFoundError);
  });
});

/**
 * « Activables » (décision du 2026-10-26) : la liste dit ce qu'une activation
 * dirait, avec le jugement même de `activate`.
 */
describe("ListProductsHandler — l'activabilité", () => {
  it("dit activable un brouillon complet, sans manque", async () => {
    const [item] = await listing(tarte(), family("pro")).execute();

    expect(item).toMatchObject({
      activatable: true,
      activationGaps: { allDiscontinued: false, byVariant: {} },
    });
  });

  it("dit non activable un brouillon sans prix pro saisi, et nomme le manque", async () => {
    const [item] = await listing(
      tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }] }),
      family("pro"),
    ).execute();

    expect(item?.activatable).toBe(false);
    expect(Object.keys(item?.activationGaps?.byVariant ?? {})).toEqual(["PAT-7-1"]);
  });

  it("dit non activable un brouillon sans prix ni allergènes", async () => {
    const [item] = await listing(tarte({ variants: [bareVariant()] }), family("pro")).execute();

    expect(item?.activatable).toBe(false);
  });

  it.each(["published", "archived"] as const)(
    "rend false et aucun manque pour une fiche %s, même complète",
    async (status) => {
      const [item] = await listing(tarte({ status }), family("pro")).execute();

      expect(item).toMatchObject({ activatable: false, activationGaps: null });
    },
  );
});

/** `plan-effacer-une-fiche-archivee.md`, point 5 : une supprimée est absente partout. */
describe("ListProductsHandler — les fiches supprimées", () => {
  it("garde une archivée (l'onglet « Archivées »)", async () => {
    const items = await listing(tarte({ status: "archived" }), family("pro")).execute();

    expect(items.map((item) => item.status)).toEqual(["archived"]);
  });

  it("n'en rend aucune supprimée, archives comprises", async () => {
    const items = await listing(tarte({ status: "deleted" }), family("pro")).execute();

    expect(items).toEqual([]);
  });
});

/** P1.1 du plan des lectures du PIM : la table lit ses constats dans sa propre réponse. */
describe("ListProductsHandler — les constats de conformité", () => {
  it("rend le constat d'une fiche vivante, sans autre lecture du catalogue", async () => {
    const product = tarte({ variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }] });

    const [item] = await listing(product, family("both")).execute();

    expect(item?.complianceWarnings).toEqual([
      {
        code: "price_missing_for_audience",
        severity: "warning",
        variantId: SELLABLE_VARIANT.id,
        sku: SELLABLE_VARIANT.sku,
        audience: "pro",
      },
    ]);
  });

  it("ne juge pas une archivée : elle ne part nulle part", async () => {
    const product = tarte({
      status: "archived",
      variants: [{ ...SELLABLE_VARIANT, proPriceMillicents: null }],
    });

    const [item] = await listing(product, family("both")).execute();

    expect(item?.complianceWarnings).toEqual([]);
  });

  it("rend une liste vide pour une fiche sans constat", async () => {
    const [item] = await listing(tarte(), family("both")).execute();

    expect(item?.complianceWarnings).toEqual([]);
  });
});

import { CategoryNotFoundError } from "../../../category/domain/errors/category-errors.js";
import type { Category } from "../../../category/domain/entities/category.js";
import type { ProductSnapshot } from "../../domain/entities/product.js";
import { ListProductsHandler } from "../list-products.js";
import {
  BOTH_RATES,
  FixedVatPercents,
  OneCategory,
  OneProduct,
  bareVariant,
  family,
  tarte,
} from "./audience-doubles.js";
import { FixedAccountingRules } from "../../../../accounting-rules/domain/ports/__tests__/fixed-accounting-rules.js";
import { FixedActiveContexts } from "../../../../sales-contexts/domain/ports/__tests__/fixed-active-contexts.js";

/** Le handler de liste, avec taux, contextes et règle du prix pro doublés. */
function listing(
  product: ProductSnapshot,
  category: Category | null,
  accounting: FixedAccountingRules = FixedAccountingRules.with("ratio_ttc", 9_000),
): ListProductsHandler {
  return new ListProductsHandler(
    new OneProduct(product),
    new OneCategory(category),
    new FixedVatPercents(BOTH_RATES),
    accounting,
    new FixedActiveContexts(["b2b", "takeaway"]),
  );
}

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
      tarte(),
      family("pro"),
      FixedAccountingRules.with("entered", 9_000),
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

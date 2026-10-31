import type { PromotionCatalogueArticle } from "../../../b2b/promotions/domain/ports/promotion-catalogue.reader.js";
import { weightExtensionConflicts } from "../../../b2b/promotions/domain/promotion-weight-conflicts.js";
import { POINT_DISCOUNT_AUDIENCES, pointDiscountTerms } from "../station-promotions.seed.js";

/**
 * **Le semis de démo face à l'extension des pourcentages au poids**
 * (décision du 2026-10-31) : la liste des conflits est dressée sur ce que le
 * semis pose, exactement. Il ne pose que des remises de POINT — au panier,
 * où l'unité de vente n'a jamais joué : aucun conflit nouveau.
 */
const WEIGHED: readonly PromotionCatalogueArticle[] = [
  { sku: "SAU-001", name: "Saumon", productId: "p_sau", categoryPath: ["fam"], saleUnit: "weight" },
];
const NOW = new Date(0);

it("aucune promotion semée n'entre en conflit par l'extension au poids", () => {
  const seeded = ["pk_a", "pk_b"].flatMap((pickupId) =>
    POINT_DISCOUNT_AUDIENCES.map((audience) => ({
      id: `${pickupId}:${audience.kind}`,
      terms: pointDiscountTerms(pickupId, { mode: "percent", bp: 1_000 }, NOW, audience),
    })),
  );
  expect(weightExtensionConflicts(seeded, WEIGHED)).toEqual([]);
});

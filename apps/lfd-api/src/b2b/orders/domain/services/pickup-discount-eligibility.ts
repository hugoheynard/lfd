import { type AudiencePickupDiscount, discountCentsOf } from "@lfd/contracts";

import {
  promotionScopeCovers,
  type PromotionScope,
} from "../../../promotions/domain/promotion-scope.js";
import type { OrderLineClassification } from "../ports/order-line-classification.reader.js";

/**
 * **L'assiette de la remise de retrait** — pure, partagée par le devis de la
 * boutique et la passation (§4.A.3 du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 */

/** Une ligne chiffrée : son SKU et son hors taxe, déjà arrondi une fois. */
export interface PricedLine {
  readonly sku: string;
  readonly htCents: number;
}

/**
 * Les SKU qui n'entrent PAS dans l'assiette. Vide sans remise : le drapeau
 * d'une ligne dit alors « rien ne l'a exclue », ce qu'il dit des bons
 * d'avant.
 */
export function ineligibleSkusOf(
  discount: AudiencePickupDiscount | null,
  lines: readonly PricedLine[],
  classifications: ReadonlyMap<string, OrderLineClassification>,
): ReadonlySet<string> {
  if (discount === null) {
    return new Set();
  }
  const scope = pickupDiscountScopeOf(discount);
  const out = new Set<string>();
  for (const line of lines) {
    const known = classifications.get(line.sku);
    const facts = {
      sku: line.sku,
      productId: known?.productId ?? null,
      categoryPath: known?.categoryPath ?? [],
    };
    if (!promotionScopeCovers(scope, facts, BASKET)) {
      out.add(line.sku);
    }
  }
  return out;
}

/** La remise de retrait est un montant de panier : l'unité de vente n'y joue pas. */
const BASKET = { kind: "basket" } as const;

/**
 * **La remise de retrait, lue comme une portée de promotion** (lot L2 du plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`) :
 * la même mécanique de portée, une seule, que la reprise en promotions
 * (L4) écrira dans `promotion_scope_rules`. Ses produits visent le
 * `product_id` (toutes déclinaisons), jamais un SKU.
 */
export function pickupDiscountScopeOf(discount: AudiencePickupDiscount): PromotionScope {
  return {
    mode: discount.scope,
    rules: [
      ...discount.products.map((rule) => ({
        target: "product" as const,
        targetId: rule.productId,
        eligible: rule.eligible,
        targetRank: null,
      })),
      ...discount.categories.map((rule) => ({
        target: "category" as const,
        targetId: rule.categoryId,
        eligible: rule.eligible,
        targetRank: null,
      })),
    ],
  };
}

/** Le hors taxe des seules lignes éligibles — l'assiette de R1. */
export function eligibleSubtotalCents(
  lines: readonly PricedLine[],
  ineligible: ReadonlySet<string>,
): number {
  return lines.reduce((sum, line) => (ineligible.has(line.sku) ? sum : sum + line.htCents), 0);
}

/** Le montant de la remise sur son assiette, borné à elle. */
export function pickupDiscountCentsOf(
  discount: AudiencePickupDiscount | null,
  lines: readonly PricedLine[],
  ineligible: ReadonlySet<string>,
): number {
  return discount === null
    ? 0
    : discountCentsOf(discount.adjustment, eligibleSubtotalCents(lines, ineligible));
}

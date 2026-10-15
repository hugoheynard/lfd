import {
  proPriceOf,
  type ProPricePolicy,
  type ProPricePrefillRowView,
  type ProPricePrefillStatus,
} from "@lfd/pim-contracts";

import { ROOT_CONTEXT_KEY } from "../../../../sales-contexts/domain/value-objects/bootstrap-contexts.js";
import type { CategoryVatPercents } from "../../../shared/domain/ports/catalogue-reader.js";
import type { ProductSnapshot } from "../entities/product.js";
import type { VariantSnapshot } from "../entities/variant.js";

/**
 * **Le plan du pré-remplissage du prix pro** (lot P, P5 de
 * `plan-catalogue-synchronise-par-audience.md`) — fonction pure.
 *
 * Elle **rejoue la porte** (`proPriceOf`) deux fois par déclinaison, sur les
 * mêmes matériaux que la projection — l'instantané RÉSOLU de la fiche et le
 * taux effectif au contexte `b2b`, celui que `vatOf` lit :
 *
 * - sous la politique **en place**, avec la saisie de la déclinaison : c'est
 *   le HT que le fil sert aujourd'hui ;
 * - sous **`ratio_ttc`** au même rapport, sans saisie : c'est le HT que
 *   l'`apply` écrirait.
 *
 * Tant que la méthode est `ratio_ttc`, les deux sont égaux par construction ;
 * l'écart, s'il apparaît, dit qu'on s'apprête à écrire autre chose que ce
 * qu'on vend — et c'est ce qui bloque l'`apply`.
 */
export function planProPricePrefill(
  products: readonly ProductSnapshot[],
  vatByProduct: ReadonlyMap<string, CategoryVatPercents>,
  policy: ProPricePolicy,
): ProPricePrefillRowView[] {
  return products.flatMap((product) => {
    const vatPercent = vatByProduct.get(product.id)?.[ROOT_CONTEXT_KEY] ?? null;
    return product.variants.map((variant) => rowOf(product, variant, vatPercent, policy));
  });
}

function rowOf(
  product: ProductSnapshot,
  variant: VariantSnapshot,
  vatPercent: number | null,
  policy: ProPricePolicy,
): ProPricePrefillRowView {
  const price = variant.priceCents;
  const served =
    price === null ? null : proPriceOf(price, policy, vatPercent, variant.proPriceMillicents);
  const prefilled =
    price === null
      ? null
      : proPriceOf(price, { method: "ratio_ttc", ratioBp: policy.ratioBp }, vatPercent, null);
  const status = statusOf(variant, vatPercent);
  const servedHt = served?.htMillicents ?? null;
  const prefilledHt = prefilled?.htMillicents ?? null;
  return {
    productId: product.id,
    productName: product.name.fr,
    variantId: variant.id,
    sku: variant.sku,
    status,
    publicTtcCents: price,
    vatPercent,
    servedHtMillicents: servedHt,
    prefilledHtMillicents: prefilledHt,
    mismatch: status === "to_prefill" && servedHt !== prefilledHt,
  };
}

/** L'ordre des cas est celui de l'écran : ce qui l'empêche le plus tôt d'abord. */
function statusOf(variant: VariantSnapshot, vatPercent: number | null): ProPricePrefillStatus {
  if (variant.pricingFollowsDefault) {
    return "aligned";
  }
  if (variant.proPriceMillicents !== null) {
    return "already_entered";
  }
  if (variant.priceCents === null) {
    return "no_price";
  }
  return vatPercent === null ? "no_vat_b2b" : "to_prefill";
}

/** Combien de lignes bloquent l'`apply`. */
export function prefillMismatches(rows: readonly ProPricePrefillRowView[]): number {
  return rows.filter((row) => row.mismatch).length;
}

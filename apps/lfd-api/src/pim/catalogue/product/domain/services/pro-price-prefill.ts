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

/** La politique en place et le rapport à rejouer — `ratioBp` est toujours posé ici. */
export interface PrefillRule {
  readonly policy: ProPricePolicy;
  readonly ratioBp: number;
}

/**
 * **Le plan du pré-remplissage du prix pro** (lot P, P5 ; lot S de
 * `plan-catalogue-synchronise-par-audience.md`) — fonction pure.
 *
 * Elle **rejoue la porte** (`proPriceOf`) deux fois par déclinaison, sur les
 * mêmes matériaux que la projection — l'instantané RÉSOLU de la fiche et le
 * taux effectif au contexte `b2b`, celui que `vatOf` lit :
 *
 * - sous la politique **en place**, avec la saisie de la déclinaison : c'est
 *   le HT que le fil sert aujourd'hui ;
 * - sous **`ratio_ttc`** au rapport posé, sans saisie : c'est le HT que
 *   l'`apply` écrirait — le même calcul que la suggestion de la fiche.
 *
 * **Le contrôle au millicentime ne vaut que sous `ratio_ttc`** (lot S) : il y
 * prouve que rien de servi ne bouge. Sous `entered`, une déclinaison sans
 * saisie n'est pas servie ; l'écart y serait de règle et ne prouverait rien —
 * l'aperçu dit alors l'autre vérité, « ces déclinaisons deviendront vendables
 * aux pros à ce prix ».
 */
export function planProPricePrefill(
  products: readonly ProductSnapshot[],
  vatByProduct: ReadonlyMap<string, CategoryVatPercents>,
  rule: PrefillRule,
): ProPricePrefillRowView[] {
  return products.flatMap((product) => {
    const vatPercent = vatByProduct.get(product.id)?.[ROOT_CONTEXT_KEY] ?? null;
    const defaultSku = product.variants.find((variant) => variant.isDefault)?.sku ?? null;
    return product.variants.map((variant) => rowOf(product, variant, vatPercent, rule, defaultSku));
  });
}

function rowOf(
  product: ProductSnapshot,
  variant: VariantSnapshot,
  vatPercent: number | null,
  rule: PrefillRule,
  defaultSku: string | null,
): ProPricePrefillRowView {
  const price = variant.priceCents;
  const served =
    price === null ? null : proPriceOf(price, rule.policy, vatPercent, variant.proPriceMillicents);
  const prefilled =
    price === null
      ? null
      : proPriceOf(price, { method: "ratio_ttc", ratioBp: rule.ratioBp }, vatPercent, null);
  const status = statusOf(variant, vatPercent);
  const servedHt = served?.htMillicents ?? null;
  const prefilledHt = prefilled?.htMillicents ?? null;
  const aligned = status === "aligned";
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
    mismatch:
      rule.policy.method === "ratio_ttc" && status === "to_prefill" && servedHt !== prefilledHt,
    followsSku: aligned ? defaultSku : null,
    alignedCause: aligned ? alignedCauseOf(variant, vatPercent) : null,
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

/**
 * **Pourquoi une alignée restera sans prix pro** — la cause de son défaut.
 *
 * L'instantané est RÉSOLU : une alignée porte le prix public et la saisie du
 * défaut, et le taux est celui de la fiche, commun à toutes ses déclinaisons.
 * Sans prix public ou sans taux `b2b`, aucune saisie ne la vendrait (la
 * projection l'écarte avant) ; sinon le défaut a, ou recevra, son prix pro.
 */
function alignedCauseOf(
  variant: VariantSnapshot,
  vatPercent: number | null,
): "no_price" | "no_vat_b2b" | null {
  if (variant.priceCents === null) {
    return "no_price";
  }
  return vatPercent === null ? "no_vat_b2b" : null;
}

/** Combien de lignes bloquent l'`apply`. */
export function prefillMismatches(rows: readonly ProPricePrefillRowView[]): number {
  return rows.filter((row) => row.mismatch).length;
}

import { type AudiencePickupDiscount, discountCentsOf, pickupDiscountCovers } from "@lfd/contracts";

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
  const out = new Set<string>();
  for (const line of lines) {
    const known = classifications.get(line.sku);
    const facts = {
      productId: known?.productId ?? null,
      categoryPath: known?.categoryPath ?? [],
    };
    if (!pickupDiscountCovers(discount, facts)) {
      out.add(line.sku);
    }
  }
  return out;
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

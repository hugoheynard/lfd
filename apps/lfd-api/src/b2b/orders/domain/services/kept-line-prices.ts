import { ttcCentsFromHtMillicents } from "@lfd/money";

import type { OrderLineInput, OrderLineSnapshot } from "../value-objects/order-line.js";
import type { OrderVatMethod } from "../value-objects/order-vat-method.js";
import type { KeptQuantityChange } from "./revised-lines.js";

/**
 * **Une ligne déjà commandée dont la quantité change garde-t-elle son prix ?**
 * — `documentation/promotions/plan-remises-acquises.md`, § 10.1. Pur.
 *
 * « Une modification ne change jamais un prix convenu en silence. » La ligne
 * est retarifée au moment de la révision pour sa quantité révisée ; si le
 * prix rendu est celui qui est figé — même prix unitaire HT (au kilo pour une
 * vente au poids), même taux, et en `exact_ht` même étiquette TTC —, elle
 * garde son figé. Sinon la révision est refusée, à la hausse comme à la
 * baisse, quelle que soit la cause : promotion finie, seuil ou palier quitté,
 * canonique, mercuriale ou taux changés. Un article sorti du catalogue ne se
 * retarife plus : refusé aussi.
 *
 * Une ligne dont la quantité NE change PAS n'est pas jugée : son prix est
 * convenu, et le refus dit justement « gardez la quantité commandée ».
 */

/** Un prix unitaire tel qu'on le compare et qu'on l'affiche. */
export interface KeptLinePrice {
  /** HT, millicentimes — au kilo pour une vente au poids. */
  readonly unitPriceMillicents: number;
  readonly vatRate: number;
  /** L'étiquette TTC d'une commande `exact_ht` ; `null` pour `line_ht`. */
  readonly unitPriceTtcCents: number | null;
}

/** Ce qui empêche une ligne déjà commandée de changer de quantité. */
export type KeptLineRefusal =
  | {
      readonly kind: "price_changed";
      readonly sku: string;
      readonly productName: string;
      readonly saleUnit: "piece" | "weight";
      readonly frozen: KeptLinePrice;
      readonly current: KeptLinePrice;
    }
  | {
      readonly kind: "withdrawn";
      readonly sku: string;
      readonly productName: string;
      readonly saleUnit: "piece" | "weight";
    };

/**
 * Les refus, dans l'ordre des lignes changées.
 *
 * `repriced` : la ligne retarifée de chaque SKU changé, ou `null` s'il n'est
 * plus au catalogue. Un SKU absent de la table est traité comme retiré — on
 * ne garde pas un prix qu'on n'a pas pu revérifier.
 */
export function keptLineRefusals(
  previous: readonly OrderLineSnapshot[],
  changes: readonly KeptQuantityChange[],
  repriced: ReadonlyMap<string, OrderLineInput | null>,
  vatMethod: OrderVatMethod,
): readonly KeptLineRefusal[] {
  const before = new Map(previous.map((line) => [line.sku, line]));
  return changes.flatMap((change): KeptLineRefusal[] => {
    const kept = before.get(change.sku);
    if (kept === undefined) {
      return [];
    }
    const named = { sku: change.sku, productName: change.productName, saleUnit: change.saleUnit };
    const current = repriced.get(change.sku) ?? null;
    if (current === null) {
      return [{ kind: "withdrawn", ...named }];
    }
    const frozen = priceOf(kept, kept.unitPriceTtcCents, vatMethod);
    const now = priceOf(current, labelOf(current), vatMethod);
    return samePrice(frozen, now)
      ? []
      : [{ kind: "price_changed", ...named, frozen, current: now }];
  });
}

function priceOf(
  line: Pick<OrderLineInput, "unitPriceMillicents" | "vatRate">,
  ttcCents: number | null,
  vatMethod: OrderVatMethod,
): KeptLinePrice {
  return {
    unitPriceMillicents: line.unitPriceMillicents,
    vatRate: line.vatRate,
    unitPriceTtcCents: vatMethod === "exact_ht" ? ttcCents : null,
  };
}

/** L'étiquette TTC que la ligne scellerait : celle de la vignette (`OrderLine.ofTtc`). */
function labelOf(line: Pick<OrderLineInput, "unitPriceMillicents" | "vatRate">): number {
  return ttcCentsFromHtMillicents(line.unitPriceMillicents, line.vatRate);
}

function samePrice(frozen: KeptLinePrice, current: KeptLinePrice): boolean {
  return (
    frozen.unitPriceMillicents === current.unitPriceMillicents &&
    frozen.vatRate === current.vatRate &&
    // Une ligne figée sans étiquette scellée (commande d'avant R3) se juge sur le HT et le taux.
    (frozen.unitPriceTtcCents === null || frozen.unitPriceTtcCents === current.unitPriceTtcCents)
  );
}

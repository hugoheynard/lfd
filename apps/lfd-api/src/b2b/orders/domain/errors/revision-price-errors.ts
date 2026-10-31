import { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type { BasketDiscountRefusal } from "../services/basket-discount-replay.js";
import type { KeptLinePrice, KeptLineRefusal } from "../services/kept-line-prices.js";

/**
 * **Les refus de la règle « une modification ne change jamais un prix
 * convenu en silence »** — `documentation/promotions/plan-remises-acquises.md`,
 * § 10.1 et § 10.2. Lus par le client et par l'équipe (aucune dérogation) :
 * chacun nomme l'article ou la remise, et les deux gestes de sortie.
 *
 * Distincts de `FrozenLinePriceChangedError`, qui reste l'alarme technique de
 * l'agrégat : ceux-ci sont des refus métier attendus, avant toute écriture.
 */

/** Une ligne déjà commandée dont la quantité changerait le prix (§ 10.1). */
export class RevisedLinePriceChangedError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly productName: string,
    readonly frozen: KeptLinePrice,
    readonly current: KeptLinePrice,
    readonly saleUnit: "piece" | "weight",
  ) {
    super(
      "orders.revise.line_price_changed",
      `Changer la quantité de « ${productName} » change son prix ` +
        `(${unitPriceWords(frozen, saleUnit)} → ${unitPriceWords(current, saleUnit)}) : ` +
        "gardez la quantité commandée, ou annulez et passez une nouvelle commande.",
    );
  }
}

/** Une ligne déjà commandée dont l'article n'est plus vendu ne change plus de quantité (§ 10.1). */
export class RevisedLineWithdrawnError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly productName: string,
  ) {
    super(
      "orders.revise.line_withdrawn",
      `« ${productName} » n'est plus vendu : gardez la quantité commandée ou retirez-le.`,
    );
  }
}

/** Une ligne couverte passerait sous le seuil figé d'une remise (§ 10.2). */
export class RevisionLosesBasketDiscountError extends BusinessError {
  constructor(
    readonly sku: string,
    readonly label: string | null,
    readonly minQuantity: number,
  ) {
    const named = label === null ? "" : ` « ${label} »`;
    super(
      "orders.revise.discount_threshold_lost",
      `Cette modification ferait perdre la remise${named} (dès ${String(minQuantity)} pièces) : ` +
        "gardez au moins cette quantité, ou annulez et passez une nouvelle commande.",
    );
  }
}

/** Le premier refus, levé — ce que la révision oppose là où le devis le montre. */
export function revisionPriceErrorOf(
  refusal: KeptLineRefusal | BasketDiscountRefusal,
): BusinessError {
  switch (refusal.kind) {
    case "price_changed":
      return new RevisedLinePriceChangedError(
        refusal.sku,
        refusal.productName,
        refusal.frozen,
        refusal.current,
        refusal.saleUnit,
      );
    case "withdrawn":
      return new RevisedLineWithdrawnError(refusal.sku, refusal.productName);
    case "below_threshold":
      return new RevisionLosesBasketDiscountError(
        refusal.sku,
        refusal.label?.fr ?? null,
        refusal.minQuantity,
      );
  }
}

const EUROS = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 3,
});

const MILLICENTS_PER_EURO = 100_000;
const CENTS_PER_EURO = 100;

/** « 1,20 € » taxe comprise quand la commande l'a scellé, sinon « 1,085 € HT » ; « le kg » au poids. */
function unitPriceWords(price: KeptLinePrice, saleUnit: "piece" | "weight"): string {
  const amount =
    price.unitPriceTtcCents === null
      ? `${EUROS.format(price.unitPriceMillicents / MILLICENTS_PER_EURO)} HT`
      : EUROS.format(price.unitPriceTtcCents / CENTS_PER_EURO);
  return saleUnit === "weight" ? `${amount} le kg` : amount;
}

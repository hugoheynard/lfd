import type { TtcComposedLine, TtcOrderComposition } from "@lfd/money";

import {
  InvalidOrderLineError,
  InvalidOrderPaymentError,
} from "../../../orders/domain/errors/order-errors.js";
import { LateFeeOnPersonalOrderError } from "../../../orders/domain/errors/order-vat-method-errors.js";
import type {
  FrozenExactTerms,
  FrozenOrderAdjustments,
} from "../../../orders/domain/ports/shortfall-decision.reader.js";
import { composeExactOrder } from "../../../orders/domain/services/exact-order-composition.js";
import type { DeliveryNoteSourceLine } from "../value-objects/delivery-note-line.js";
import { copyOfTerms, type DeliveryNoteTerms } from "../value-objects/delivery-note-terms.js";

/** Ce qui part d'une commande `exact_ht` : ses lignes réécrites, et leur en-tête. */
export interface ExactDeparture {
  readonly lines: readonly DeliveryNoteSourceLine[];
  readonly terms: DeliveryNoteTerms;
}

/** Les lignes qui partent, aux quantités décidées, et les règles figées de la commande. */
export interface ExactDepartureInput {
  readonly orderNumber: string;
  readonly lines: readonly DeliveryNoteSourceLine[];
  readonly adjustments: FrozenOrderAdjustments;
  readonly exact: FrozenExactTerms;
}

/**
 * **Le BL partiel d'une commande composée en TTC** (plan
 * `documentation/pricing/plan-centime-particuliers.md`, § 5, « Le bon de
 * livraison partiel ») — recomposé EN ENTIER par la fonction de la passation
 * (`composeExactOrder`) sur les lignes qui partent : TOUTES ses lignes sont
 * réécrites, celles qui partent en entier comprises, pour que leurs HT
 * somment vers l'en-tête. Recopier une ligne figée mêlerait deux répartitions
 * de la TVA.
 *
 * - port en montant fixe : le TTC figé sur la commande, sans reconversion ;
 *   la garde le compare à ce TTC ;
 * - port en pourcentage et remise retrait : refaits sur le TTC livré ;
 * - bon de fidélité : le TTC imputé sur la commande, borné au TTC livré après
 *   remise (la composition borne).
 *
 * @throws {LateFeeOnPersonalOrderError} une surtaxe sur une commande de particulier (R5).
 * @throws {InvalidOrderPaymentError} le port composé n'est pas le port figé.
 * @throws {InvalidDeliveryNoteTermsError} un total non entier.
 */
export function exactDepartureOf(input: ExactDepartureInput): ExactDeparture {
  const { adjustments, exact } = input;
  if (adjustments.lateFee !== null) {
    throw new LateFeeOnPersonalOrderError();
  }
  const fixedFee = adjustments.deliveryFee?.mode === "amount";
  const composition = composeExactOrder({
    // Chaque ligne recompose dans SON unité, recopiée de la commande
    // (`vente-au-poids.md`, P5) : au poids, prix au kilo × grammes.
    lines: input.lines,
    discountAdjustment: adjustments.discount,
    deliveryFeeAdjustment: adjustments.deliveryFee,
    deliveryVatMode: adjustments.deliveryVatMode,
    voucherFaceCents: exact.voucherTtcCents,
    deliveryFeeFrozenTtcCents: fixedFee ? exact.deliveryFeeTtcCents : undefined,
  });
  ensureFrozenFeeKept(adjustments, exact, composition);
  const lines = input.lines.map((line, i) => rewritten(line, composition.lines[i]));
  return { lines, terms: termsOf(input, lines, composition) };
}

/**
 * Un port fixe reste celui de la commande ; sans barème, il n'y a pas de port.
 *
 * @throws {InvalidOrderPaymentError}
 */
function ensureFrozenFeeKept(
  adjustments: FrozenOrderAdjustments,
  exact: FrozenExactTerms,
  composition: TtcOrderComposition,
): void {
  const fee = adjustments.deliveryFee;
  const expected = fee === null ? 0 : fee.mode === "amount" ? exact.deliveryFeeTtcCents : null;
  if (expected !== null && composition.deliveryFee.ttcCents !== expected) {
    throw new InvalidOrderPaymentError(
      "Les frais de livraison du bon, taxe comprise, ne sont pas ceux figés sur la commande.",
    );
  }
}

/** La ligne réécrite par sa composition : étiquette, TTC et HT de ligne. */
function rewritten(
  line: DeliveryNoteSourceLine,
  composed: TtcComposedLine | undefined,
): DeliveryNoteSourceLine {
  if (composed === undefined) {
    throw new InvalidOrderLineError(line.sku, "aucune composition taxe comprise pour cette ligne");
  }
  return {
    ...line,
    lineTotalCents: composed.htCents,
    unitPriceTtcCents: composed.labelCents,
    lineTotalTtcCents: composed.ttcCents,
  };
}

function termsOf(
  input: ExactDepartureInput,
  lines: readonly DeliveryNoteSourceLine[],
  composition: TtcOrderComposition,
): DeliveryNoteTerms {
  return copyOfTerms(input.orderNumber, {
    subtotalCents: lines.reduce((sum, line) => sum + line.lineTotalCents, 0),
    discountCents: composition.pickupDiscount.htCents,
    voucherDiscountCents: composition.voucher.htCents,
    deliveryFeeCents: composition.deliveryFee.htCents,
    deliveryVatMode: input.adjustments.deliveryVatMode,
    lateFeeCents: 0,
    lateFeeAdjustment: null,
    // La forme de l'agrégat (`order-exact-amounts.ts`) : une part par taux taxé, croissant.
    vatShares: composition.byRate
      .filter((part) => part.vatCents !== 0)
      .map((part) => ({ rate: part.vatRate, amountCents: part.vatCents })),
    vatCents: composition.total.vatCents,
    totalCents: composition.total.ttcCents,
    ttcTerms: {
      discountCents: composition.pickupDiscount.ttcCents,
      voucherCents: composition.voucher.ttcCents,
      deliveryFeeCents: composition.deliveryFee.ttcCents,
      byRate: composition.byRate.map((part) => ({
        rate: part.vatRate,
        htCents: part.htCents,
        vatCents: part.vatCents,
        ttcCents: part.ttcCents,
      })),
    },
  });
}

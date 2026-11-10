import { chainLineHtBasketDiscounts } from "../../../orders/domain/services/basket-discounts.js";
import { composeExactOrder } from "../../../orders/domain/services/exact-order-composition.js";
import type { FrozenBasketDiscount } from "../../../orders/domain/services/frozen-basket-discounts.js";
import type { DiscountVatShare } from "../../../orders/domain/services/order-discount-recovery-shapes.js";
import { FIRST_DELIVERY_NOTE_RANK, type DeliveryNoteState } from "../entities/delivery-note.js";
import type { DeliveryNoteSourceLine } from "../value-objects/delivery-note-line.js";
import type { DeliveryNoteTerms } from "../value-objects/delivery-note-terms.js";
import {
  noteBasketDiscountsOf,
  remainderDiscountsOf,
  type NoteBasketDiscount,
} from "./note-basket-discounts.js";

/** La part d'une remise de commande sur un bon (`delivery_note_discounts`). */
export interface DeliveryNoteDiscountPart {
  readonly orderDiscountId: string;
  /** HT, positif. */
  readonly amountCents: number;
  /** Son TTC — bon `exact_ht` seulement. */
  readonly amountTtcCents: number | null;
  readonly vatShares: readonly DiscountVatShare[];
}

/**
 * Ce que le départ d'un bon fige de ses remises : ses parts, ou la raison
 * pour laquelle rien n'est écrit — jamais une part inventée.
 */
export type DeliveryNoteDiscountParts =
  | { readonly kind: "parts"; readonly parts: readonly DeliveryNoteDiscountPart[] }
  | { readonly kind: "unrecorded"; readonly reason: string };

/** Une étape rejouée sur le bon, avant le contrôle. */
interface ReplayedStep {
  readonly discount: NoteBasketDiscount;
  readonly amountCents: number;
  readonly amountTtcCents: number | null;
  readonly vatShares: readonly DiscountVatShare[];
}

/**
 * **Les parts d'un bon, par remise, au départ** — `documentation/promotions/promotions.md`, § 2.11
 * (`delivery_note_discounts`), lot M4.
 *
 * Chaque remise de la commande est rejouée sur les lignes du bon par la
 * fonction qui a composé son en-tête (`chainLineHtBasketDiscounts` en
 * `line_ht`, `composeExactOrder` en `exact_ht`) ; la somme doit redonner la
 * remise de l'en-tête, au centime, sans quoi rien n'est écrit. Un reliquat
 * ne rejoue que les pourcentages : un montant fixe n'a qu'une part, sur le
 * BL-1, et n'est jamais compté deux fois.
 *
 * **Dette existante, non aggravée** (§ 18.2) : sur le BL-1, un fixe reste
 * borné à l'assiette des lignes qui partent — sa part est ce que l'en-tête a
 * compté, pas le montant de la commande.
 *
 * Une remise lue dans les colonnes (commande non reprise) n'a pas de ligne
 * `order_discounts` à citer : rien n'est écrit, la reprise écrira la part de
 * ce bon avec celle de sa commande (`backfill-order-discounts.ts`).
 */
export function deliveryNoteDiscountPartsOf(
  note: Pick<DeliveryNoteState, "rank" | "lines" | "terms">,
  discounts: readonly FrozenBasketDiscount[],
): DeliveryNoteDiscountParts {
  const { terms } = note;
  if (terms === null) {
    return unrecorded("bon sans en-tête");
  }
  const considered =
    note.rank === FIRST_DELIVERY_NOTE_RANK ? discounts : remainderDiscountsOf(discounts);
  // Une ligne d'avant E4a ne disait rien : les bons d'avant étaient tous éligibles.
  const lines = note.lines.map((line): DeliveryNoteSourceLine => ({
    ...line,
    pickupDiscountEligible: line.pickupDiscountEligible ?? true,
  }));
  const replayed = noteBasketDiscountsOf(considered, lines);
  const steps =
    terms.ttcTerms === null ? lineHtSteps(lines, replayed) : exactSteps(lines, replayed);
  const gap = gapOf(steps, terms);
  if (gap !== null) {
    return unrecorded(gap);
  }
  const applied = steps.filter((step) => step.amountCents !== 0 || step.amountTtcCents !== 0);
  const parts: DeliveryNoteDiscountPart[] = [];
  for (const step of applied) {
    const id = step.discount.frozen.orderDiscountId;
    if (id === null) {
      return unrecorded("commande non reprise : sa remise se lit dans les colonnes");
    }
    parts.push({
      orderDiscountId: id,
      amountCents: step.amountCents,
      amountTtcCents: step.amountTtcCents,
      vatShares: step.vatShares,
    });
  }
  return { kind: "parts", parts };
}

function unrecorded(reason: string): DeliveryNoteDiscountParts {
  return { kind: "unrecorded", reason };
}

function lineHtSteps(
  lines: readonly DeliveryNoteSourceLine[],
  replayed: readonly NoteBasketDiscount[],
): readonly ReplayedStep[] {
  const chain = chainLineHtBasketDiscounts(
    lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
    replayed.map((discount) => discount.basket),
  );
  return replayed.map((discount, k) => {
    const step = chain.steps[k];
    return {
      discount,
      amountCents: step?.amountCents ?? 0,
      amountTtcCents: null,
      vatShares: [...(step?.parts ?? new Map<number, number>())]
        .sort(([left], [right]) => left - right)
        .map(([rate, htCents]) => ({ rate, htCents })),
    };
  });
}

/** Les termes de remise ne dépendent ni du bon de fidélité ni du port : ils passent avant. */
function exactSteps(
  lines: readonly DeliveryNoteSourceLine[],
  replayed: readonly NoteBasketDiscount[],
): readonly ReplayedStep[] {
  const composition = composeExactOrder({
    lines,
    discountAdjustment: null,
    basketDiscounts: replayed.map((discount) => discount.basket),
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherFaceCents: 0,
  });
  return replayed.map((discount, k) => {
    const term = composition.basketDiscounts[k];
    return {
      discount,
      amountCents: term?.htCents ?? 0,
      amountTtcCents: term?.ttcCents ?? 0,
      vatShares: [...(term?.parts ?? [])]
        .sort((left, right) => left.vatRate - right.vatRate)
        .map((part) => ({
          rate: part.vatRate,
          htCents: part.htCents,
          vatCents: part.vatCents,
          ttcCents: part.ttcCents,
        })),
    };
  });
}

/** L'écart entre les étapes rejouées et la remise de l'en-tête, en phrase ; `null` s'il n'y en a pas. */
function gapOf(steps: readonly ReplayedStep[], terms: DeliveryNoteTerms): string | null {
  const ht = steps.reduce((sum, step) => sum + step.amountCents, 0);
  if (ht !== terms.discountCents) {
    return `remises rejouées ${ht} c HT, en-tête du bon ${terms.discountCents} c HT`;
  }
  const ttcTerms = terms.ttcTerms;
  if (ttcTerms === null) {
    return null;
  }
  const ttc = steps.reduce((sum, step) => sum + (step.amountTtcCents ?? 0), 0);
  return ttc === ttcTerms.discountCents
    ? null
    : `remises rejouées ${ttc} c TTC, en-tête du bon ${ttcTerms.discountCents} c TTC`;
}

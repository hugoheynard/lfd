import type { CartAdjustment, OrderRateAmounts } from "@lfd/contracts";
import type { TtcComposedTerm, TtcOrderComposition } from "@lfd/money";

import { chainLineHtBasketDiscounts } from "./basket-discounts.js";
import { composeExactOrder } from "./exact-order-composition.js";
import type {
  DiscountVatShare,
  RecoveredAmounts,
  RecoveredNoteDiscount,
  RecoveryLine,
  RecoveryNote,
  RecoveryOrder,
} from "./order-discount-recovery-shapes.js";

/**
 * **La remise unique d'une commande, recomposée par la fonction de M1** —
 * plan des promotions, § 18.3, points 2 et 3. Rien n'est écrit ici : on
 * recompose, puis on compare au figé. Le premier écart trouvé est rendu en
 * phrase (« attendu, obtenu »), et la reprise bascule alors en `frozen`.
 */
export type Recomposition =
  | {
      readonly kind: "equal";
      readonly order: RecoveredAmounts;
      readonly notes: readonly RecoveredNoteDiscount[];
    }
  | { readonly kind: "gap"; readonly gap: string };

/** Recompose la commande et ses bons ; le premier écart l'emporte. */
export function recomposeOrderDiscount(order: RecoveryOrder): Recomposition {
  const adjustment = order.discountAdjustment;
  if (adjustment === null) {
    return gap("aucun ajustement figé (`discount_adjustment` vide) : rien ne se recompose");
  }
  const own =
    order.vatMethod === "line_ht"
      ? lineHtAmounts(order.lines, adjustment, order.discountCents)
      : exactOrderAmounts(order, adjustment);
  if (typeof own === "string") {
    return gap(own);
  }
  const notes: RecoveredNoteDiscount[] = [];
  for (const note of order.notes) {
    const part = notePart(order, adjustment, note);
    if (typeof part === "string") {
      return gap(part);
    }
    if (part !== null) {
      notes.push({ noteId: note.id, ...part });
    }
  }
  return { kind: "equal", order: own, notes };
}

function gap(text: string): Recomposition {
  return { kind: "gap", gap: text };
}

/**
 * La part d'un bon. `null` : rien à écrire — bon annulé, sans en-tête, ou
 * remise nulle. Un montant fixe n'est compté que sur le BL-1 (règle du
 * reliquat, § 18.2) : un reliquat qui en porterait un est un écart.
 */
function notePart(
  order: RecoveryOrder,
  adjustment: CartAdjustment,
  note: RecoveryNote,
): RecoveredAmounts | string | null {
  if (note.voided || note.discountCents === null) {
    return null;
  }
  if (adjustment.mode === "amount" && note.rank > 1) {
    return note.discountCents === 0
      ? null
      : `bon de rang ${note.rank} : montant fixe compté sur un reliquat (${note.discountCents} c)`;
  }
  if (note.discountCents === 0) {
    return null;
  }
  const amounts =
    order.vatMethod === "line_ht"
      ? lineHtAmounts(note.lines, adjustment, note.discountCents)
      : exactNoteAmounts(order, adjustment, note);
  return typeof amounts === "string" ? `bon de rang ${note.rank} : ${amounts}` : amounts;
}

/** `line_ht` : l'étape de rang 1 de M1, sur les lignes éligibles, au HT. */
function lineHtAmounts(
  lines: readonly RecoveryLine[],
  adjustment: CartAdjustment,
  frozenCents: number,
): RecoveredAmounts | string {
  const chain = chainLineHtBasketDiscounts(
    lines.map((line) => ({ htCents: line.lineTotalCents, vatRate: line.vatRate })),
    [{ adjustment, coveredLines: coveredIndices(lines) }],
  );
  const amountCents = chain.steps[0]?.amountCents ?? 0;
  if (amountCents !== frozenCents) {
    return `remise recomposée ${amountCents} c HT, figée ${frozenCents} c HT`;
  }
  const parts = chain.steps[0]?.parts ?? new Map<number, number>();
  const vatShares = [...parts]
    .sort(([left], [right]) => left - right)
    .map(([rate, htCents]) => ({ rate, htCents }));
  return { amountCents, amountTtcCents: null, vatShares };
}

/** `exact_ht` : la composition de la passation, comparée terme et parts par taux. */
function exactOrderAmounts(
  order: RecoveryOrder,
  adjustment: CartAdjustment,
): RecoveredAmounts | string {
  const composition = composeExactOrder({
    lines: order.lines.map(compositionLine),
    discountAdjustment: adjustment,
    deliveryFeeAdjustment: order.deliveryFeeAdjustment,
    deliveryVatMode: order.deliveryVatMode,
    // Le bon imputé, déjà borné : la composition le reborne sans le changer.
    voucherFaceCents: order.voucherTtcCents ?? 0,
  });
  const term = composition.basketDiscounts[0];
  const termGap = exactTermGap(term, order.discountCents, order.discountTtcCents);
  if (termGap !== null) {
    return termGap;
  }
  const rateGap = byRateGap(composition, order.ttcByRate);
  if (rateGap !== null) {
    return rateGap;
  }
  return exactAmountsOf(term);
}

/** `exact_ht` sur un bon : la composition du bon partiel (`exactDepartureOf`). */
function exactNoteAmounts(
  order: RecoveryOrder,
  adjustment: CartAdjustment,
  note: RecoveryNote,
): RecoveredAmounts | string {
  const fixedFee = order.deliveryFeeAdjustment?.mode === "amount";
  const composition = composeExactOrder({
    lines: note.lines.map(compositionLine),
    discountAdjustment: adjustment,
    deliveryFeeAdjustment: order.deliveryFeeAdjustment,
    deliveryVatMode: order.deliveryVatMode,
    voucherFaceCents: order.voucherTtcCents ?? 0,
    deliveryFeeFrozenTtcCents: fixedFee ? (order.deliveryFeeTtcCents ?? undefined) : undefined,
  });
  const term = composition.basketDiscounts[0];
  const termGap = exactTermGap(term, note.discountCents ?? 0, note.discountTtcCents);
  return termGap ?? exactAmountsOf(term);
}

function exactTermGap(
  term: TtcComposedTerm | undefined,
  frozenHt: number,
  frozenTtc: number | null,
): string | null {
  const ht = term?.htCents ?? 0;
  const ttc = term?.ttcCents ?? 0;
  if (ht !== frozenHt || ttc !== frozenTtc) {
    return `remise recomposée ${ht} c HT / ${ttc} c TTC, figée ${frozenHt} c HT / ${String(frozenTtc)} c TTC`;
  }
  return null;
}

/**
 * Les parts par taux de la commande, à l'identique de `ttc_by_rate`. Une
 * commande `exact_ht` d'avant la colonne n'a pas ce figé : il ne se compare
 * pas, le terme de remise reste comparé.
 */
function byRateGap(
  composition: TtcOrderComposition,
  frozen: readonly OrderRateAmounts[] | null,
): string | null {
  if (frozen === null) {
    return null;
  }
  const composed = composition.byRate.map((part) => rateKey(part.vatRate, part));
  const stored = [...frozen]
    .sort((left, right) => left.rate - right.rate)
    .map((part) => rateKey(part.rate, part));
  const left = composed.join(" ; ");
  const right = stored.join(" ; ");
  return left === right ? null : `parts par taux recomposées [${left}], figées [${right}]`;
}

function rateKey(
  rate: number,
  part: { readonly htCents: number; readonly vatCents: number; readonly ttcCents: number },
): string {
  return `${rate} % : ${part.htCents}/${part.vatCents}/${part.ttcCents}`;
}

function exactAmountsOf(term: TtcComposedTerm | undefined): RecoveredAmounts {
  const vatShares: DiscountVatShare[] = (term?.parts ?? [])
    .map((part) => ({
      rate: part.vatRate,
      htCents: part.htCents,
      vatCents: part.vatCents,
      ttcCents: part.ttcCents,
    }))
    .sort((left, right) => left.rate - right.rate);
  return {
    amountCents: term?.htCents ?? 0,
    amountTtcCents: term?.ttcCents ?? 0,
    vatShares,
  };
}

function compositionLine(line: RecoveryLine) {
  return {
    unitPriceMillicents: line.unitPriceMillicents,
    quantity: line.quantity,
    saleUnit: line.saleUnit,
    vatRate: line.vatRate,
    pickupDiscountEligible: line.eligible,
  };
}

/** Les indices des lignes couvertes par la remise unique : les éligibles. */
export function coveredIndices(lines: readonly RecoveryLine[]): readonly number[] {
  return lines.flatMap((line, index) => (line.eligible ? [index] : []));
}

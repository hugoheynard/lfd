import { composeExactOrder } from "./exact-order-composition.js";
import { coveredIndices, recomposeOrderDiscount } from "./order-discount-recomposition.js";
import type {
  DiscountVatShare,
  OrderDiscountRecovery,
  RecoveredAmounts,
  RecoveredNoteDiscount,
  RecoveryOrder,
} from "./order-discount-recovery-shapes.js";

/**
 * **La reprise d'une remise unique en ligne `order_discounts`** — plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 18.3, lot M2.
 *
 * 1. La remise est recomposée par la fonction de M1 et comparée au figé : à
 *    l'égalité, elle est écrite `computed`, avec ses parts recomposées.
 * 2. Sinon, rien n'est inventé ni recalculé : elle est écrite `frozen`,
 *    recopiée des colonnes figées — montant, TTC, et UNE part au taux unique
 *    de la commande. L'écart est rendu pour le rapport.
 * 3. Une commande en écart à plusieurs taux ne se recopie pas sans inventer
 *    une ventilation : `undecided`, rien n'est écrit, la question revient à
 *    Hugo pour cette commande.
 *
 * Le mapper d'écriture recopie promotion, ajustement et libellé tels qu'ils
 * sont figés : ils ne passent pas par ici, rien ne les juge.
 */
export function recoverOrderDiscount(order: RecoveryOrder): OrderDiscountRecovery {
  const recomposed = recomposeOrderDiscount(order);
  const coveredLineIds = order.lines.filter((line) => line.eligible).map((line) => line.id);
  const baseCents = baseCentsOf(order);
  if (recomposed.kind === "equal") {
    return {
      kind: "recovered",
      gap: null,
      discount: {
        origin: "computed",
        baseCents,
        coveredLineIds,
        ...recomposed.order,
        notes: recomposed.notes,
      },
    };
  }
  const frozen = frozenAmounts(order);
  if (typeof frozen === "string") {
    return { kind: "undecided", reason: `${recomposed.gap} — ${frozen}` };
  }
  return {
    kind: "recovered",
    gap: recomposed.gap,
    discount: { origin: "frozen", baseCents, coveredLineIds, ...frozen.order, notes: frozen.notes },
  };
}

/**
 * L'assiette de l'étape de rang 1 : la somme des lignes couvertes, entière —
 * HT figé en `line_ht`, TTC de ligne composé en `exact_ht` (le TTC sur lequel
 * la remise se prend). Elle ne dépend pas de la remise figée.
 */
function baseCentsOf(order: RecoveryOrder): number {
  const covered = new Set(coveredIndices(order.lines));
  if (order.vatMethod === "line_ht") {
    return order.lines.reduce(
      (sum, line, i) => (covered.has(i) ? sum + line.lineTotalCents : sum),
      0,
    );
  }
  const composition = composeExactOrder({
    lines: order.lines.map((line) => ({
      unitPriceMillicents: line.unitPriceMillicents,
      quantity: line.quantity,
      saleUnit: line.saleUnit,
      vatRate: line.vatRate,
    })),
    discountAdjustment: null,
    deliveryFeeAdjustment: null,
    deliveryVatMode: null,
    voucherFaceCents: 0,
  });
  return composition.lines.reduce(
    (sum, line, i) => (covered.has(i) ? sum + line.ttcCents : sum),
    0,
  );
}

interface FrozenAmounts {
  readonly order: RecoveredAmounts;
  readonly notes: readonly RecoveredNoteDiscount[];
}

/**
 * Les colonnes figées, recopiées. La part par taux n'est pas figée par
 * commande : elle ne se déduit sans calcul que si les lignes COUVERTES par la
 * remise sont d'un seul taux (§ 18.3, point 4 ; décision sur le rapport de
 * M2, 2026-10-30 — une ligne exclue n'a reçu aucune part de la remise).
 * Sinon, la raison du refus.
 */
function frozenAmounts(order: RecoveryOrder): FrozenAmounts | string {
  const covered = order.lines.filter((line) => line.eligible);
  const rates = [...new Set(covered.map((line) => line.vatRate))];
  const rate = rates[0];
  if (rates.length !== 1 || rate === undefined) {
    return `lignes couvertes à ${rates.length} taux : la part par taux ne se recopie pas sans calcul, à trancher par Hugo`;
  }
  const own = copied(order.vatMethod, rate, order.discountCents, order.discountTtcCents);
  if (own === null) {
    return "commande `exact_ht` sans `discount_ttc_cents` figé";
  }
  const notes: RecoveredNoteDiscount[] = [];
  for (const note of order.notes) {
    if (note.voided || note.discountCents === null || note.discountCents === 0) {
      continue;
    }
    const part = copied(order.vatMethod, rate, note.discountCents, note.discountTtcCents);
    if (part === null) {
      return `bon de rang ${note.rank} \`exact_ht\` sans \`discount_ttc_cents\` figé`;
    }
    notes.push({ noteId: note.id, ...part });
  }
  return { order: own, notes };
}

function copied(
  method: RecoveryOrder["vatMethod"],
  rate: number,
  htCents: number,
  ttcCents: number | null,
): RecoveredAmounts | null {
  if (method === "line_ht") {
    return { amountCents: htCents, amountTtcCents: null, vatShares: [{ rate, htCents }] };
  }
  if (ttcCents === null) {
    return null;
  }
  const share: DiscountVatShare = { rate, htCents, vatCents: ttcCents - htCents, ttcCents };
  return { amountCents: htCents, amountTtcCents: ttcCents, vatShares: [share] };
}

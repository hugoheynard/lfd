import type { SettlementRegime } from "@lfd/contracts";

import type { BusinessError } from "../../../../platform/shared/errors/app-error.js";
import type {
  DepartingQuantity,
  ShortfallDecisionSubject,
} from "../entities/shortfall-decision.js";
import {
  CardIncreasePendingShortfallError,
  CardOrderUnpaidShortfallError,
  OrderTooOldForShortfallError,
  RemainderNotDecidableError,
  ShortfallAlreadyDecidedError,
  ShortfallOrderNotConfirmedError,
  VoucherOrderShortfallError,
} from "../errors/shortfall-decision-errors.js";

/**
 * Pourquoi le départ de cet envoi ne se décide pas, sans lire le bac — dans
 * l'ordre où la décision juge : déjà décidé, envoi plus à coliser (commande
 * pas confirmée, reliquat pas prévu), carte pas encore encaissée, hausse par
 * carte en cours, bon de fidélité, termes non figés.
 */
export type ShortfallDecisionRefusal =
  | "already_decided"
  | "not_confirmed"
  | "remainder_not_planned"
  | "card_unpaid"
  | "card_increase_pending"
  | "voucher"
  | "too_old";

const UNPAID_CARD: SettlementRegime = "due";
const PAID_CARD: SettlementRegime = "paid";

/** Le rang de la commande elle-même (comme `order-billing.ts`). */
const FIRST_SHIPMENT_RANK = 1;

/** Le seul état d'un reliquat dont le départ se décide : son bac n'est pas fermé. */
const DECIDABLE_REMAINDER_NOTE = "planned";

/**
 * **Les refus qui ne dépendent pas du bac**, rendus au lieu d'être levés —
 * une règle, deux lecteurs : la décision (`ShortfallDecision`, qui lève) et
 * l'aperçu du départ incomplet au comptoir (lot C1b, Hugo, 2026-11-03, qui
 * les dit avant le geste). `null` : rien ne s'y oppose.
 */
export function decidabilityRefusalOf(
  subject: ShortfallDecisionSubject,
): ShortfallDecisionRefusal | null {
  if (subject.decided) {
    return "already_decided";
  }
  return shipmentToPackRefusalOf(subject) ?? termsRefusalOf(subject);
}

/**
 * L'envoi SIGNALÉ est encore à coliser (plan E7 reliquat, choix 11) : au
 * rang 1, la commande confirmée, comme avant ; au-delà, le BL du reliquat
 * prévu. Le même jour, la commande peut être prête pendant que son reste
 * colise : c'est le reste qui décide.
 */
function shipmentToPackRefusalOf(
  subject: ShortfallDecisionSubject,
): ShortfallDecisionRefusal | null {
  if (subject.rank === FIRST_SHIPMENT_RANK) {
    return subject.status === "confirmed" ? null : "not_confirmed";
  }
  return subject.remainderNoteStatus === DECIDABLE_REMAINDER_NOTE ? null : "remainder_not_planned";
}

/**
 * Une carte ENCAISSÉE se décide : le reste se rembourse au solde (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 2.1). Pas
 * encore encaissée, il n'y a rien à rendre ; une hausse vivante changerait le
 * total sous la décision — la révision la refuse ensuite
 * (`ensureNoShortfallDecision`), la décision la refuse avant.
 */
function termsRefusalOf(subject: ShortfallDecisionSubject): ShortfallDecisionRefusal | null {
  if (subject.settlementRegime === UNPAID_CARD) {
    return "card_unpaid";
  }
  if (subject.settlementRegime === PAID_CARD && subject.increasePending) {
    return "card_increase_pending";
  }
  if (subject.voucherDiscountCents > 0) {
    return "voucher";
  }
  const unfrozen = subject.frozenTerms.some(
    (term) => term.amountCents !== 0 && !term.hasAdjustment,
  );
  return unfrozen ? "too_old" : null;
}

const REFUSAL_ERRORS: Readonly<
  Record<ShortfallDecisionRefusal, (subject: ShortfallDecisionSubject) => BusinessError>
> = {
  already_decided: (subject) => new ShortfallAlreadyDecidedError(shipmentLabelOf(subject)),
  not_confirmed: (subject) =>
    new ShortfallOrderNotConfirmedError(subject.reference, subject.status),
  remainder_not_planned: (subject) =>
    new RemainderNotDecidableError(subject.reference, subject.rank, subject.remainderNoteStatus),
  card_unpaid: (subject) => new CardOrderUnpaidShortfallError(subject.reference),
  card_increase_pending: (subject) => new CardIncreasePendingShortfallError(subject.reference),
  voucher: (subject) => new VoucherOrderShortfallError(subject.reference),
  too_old: (subject) => new OrderTooOldForShortfallError(subject.reference),
};

/** L'erreur que la décision lève pour ce refus — la même qu'avant l'extraction. */
export function decidabilityError(
  refusal: ShortfallDecisionRefusal,
  subject: ShortfallDecisionSubject,
): BusinessError {
  return REFUSAL_ERRORS[refusal](subject);
}

/**
 * Ce qui part : la quantité au bac de chaque ligne — ou `null` si rien n'y
 * est (« rien au bac », renvoyé à l'annulation). Partagé par la décision et
 * l'aperçu du comptoir (C1b).
 */
export function departingOf(
  lines: readonly { readonly sku: string; readonly packed: number }[],
): readonly DepartingQuantity[] | null {
  const departing = lines.map((line) => ({ sku: line.sku, quantity: line.packed }));
  return departing.every((line) => line.quantity === 0) ? null : departing;
}

/**
 * L'envoi tel que l'équipe le lit : le numéro de commande au rang 1,
 * `ORD-…-<rang>` au-delà — la référence du comptoir et du BL d'un reste.
 */
export function shipmentLabelOf(subject: ShortfallDecisionSubject): string {
  return subject.rank === FIRST_SHIPMENT_RANK
    ? subject.reference
    : `${subject.reference}-${String(subject.rank)}`;
}

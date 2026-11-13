import type { SettlementRegime, ShortfallRefundCause } from "@lfd/contracts";

import {
  type CardRefundPart,
  type OpenRefundRequestShape,
  type RefundablePayment,
  splitRefund,
} from "../../revision/domain/services/revision-card-refund.js";

export type { ShortfallRefundCause };

/**
 * La commande, relue sous son verrou (ou sans, pour l'affichage) : ce que le
 * reste d'un départ incomplet juge AVANT de lire l'argent.
 */
export interface ShortfallRefundSubject {
  readonly orderId: string;
  readonly reference: string;
  /** Une décision de départ incomplet existe. */
  readonly partial: boolean;
  readonly regime: SettlementRegime;
  /** `orders.billable_total_cents`, la colonne brute — `null` tant que le solde n'est pas posé. */
  readonly billableTotalCents: number | null;
  /** Une facture 380 porte la commande. */
  readonly invoiced: boolean;
  /** Un projet de hausse par carte est vivant. */
  readonly increasePending: boolean;
}

/** Une demande de remboursement du sujet, terminées comprises. */
export interface ShortfallRefundRequestShape extends OpenRefundRequestShape {
  readonly requestId: string;
  readonly nature: "return" | "adjustment";
  /** Le code du sujet (`revision`, `shortfall`…). */
  readonly reason: string;
  readonly announcedCents: number;
}

/** Un remboursement réussi, rattaché à la demande qui l'a émis (`null` : hors plateforme). */
export interface SucceededRefundShape {
  readonly requestId: string | null;
  readonly amountCents: number;
}

/** L'argent carte de la commande, tel que le bloc `card-payment` le rend. */
export interface ShortfallRefundMoney {
  /** Encaissé : `Σ` des paiements `paid`. */
  readonly chargedCents: number;
  /** Remboursé réussi de nature `adjustment` (y compris « Réglé autrement »). */
  readonly adjustmentRefundedCents: number;
  /** Remboursé réussi sans nature : un `re_…` fait hors de la plateforme. */
  readonly unattributedRefundedCents: number;
  /** Les paiements qui se rendent (R4), du plus ancien au plus récent. */
  readonly payments: readonly RefundablePayment[];
  /** Un des paiements qui se rendent n'est pas encaissé. */
  readonly unpaid: boolean;
  /** Toutes les demandes du sujet, terminées comprises. */
  readonly requests: readonly ShortfallRefundRequestShape[];
  readonly succeeded: readonly SucceededRefundShape[];
}

/** Le jugement : rien à faire, un blocage à journaliser, ou les parts à demander. */
export type ShortfallRefundVerdict =
  | { readonly kind: "none" }
  | {
      readonly kind: "blocked";
      readonly cause: ShortfallRefundCause;
      /** `null` : la cause est jugée avant le calcul. */
      readonly amountCents: number | null;
      readonly stoppedAmount: boolean;
    }
  | {
      readonly kind: "refund";
      readonly amountCents: number;
      readonly parts: readonly CardRefundPart[];
    };

const NONE: ShortfallRefundVerdict = { kind: "none" };
const PAID_CARD: SettlementRegime = "paid";
const OPEN_STATES: ReadonlySet<string> = new Set(["to_issue", "issued", "stopped"]);

/**
 * **Phase 1, ce qui se juge sans l'argent** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2, étapes
 * 2 et 3). `null` : il faut lire l'argent.
 */
export function shortfallRefundGateOf(
  subject: ShortfallRefundSubject,
): ShortfallRefundVerdict | null {
  if (!subject.partial || subject.regime !== PAID_CARD || subject.billableTotalCents === null) {
    return NONE;
  }
  if (subject.invoiced) {
    return blocked("already_invoiced", null);
  }
  if (subject.increasePending) {
    return blocked("increase_pending", null);
  }
  return null;
}

/**
 * **Phase 1, le reste à rendre** (§ 4.2, étapes 5 à 9), sur le facturable
 * relu sous le verrou — jamais sur le payload du fait, qu'un relais peut
 * livrer dans le désordre :
 *
 * `encaissé − ajustements réussis − ce que les demandes d'ajustement
 * ouvertes annoncent encore − facturable`.
 *
 * Une demande ouverte (`to_issue`, `issued`, `stopped`) peut déjà porter un
 * remboursement réussi : un `re_…` d'une génération précédente arrivé tard,
 * ou une `amount` émise pour un autre montant puis arrêtée. Ce réussi est
 * déjà dans les ajustements : la demande n'annonce plus que ce qu'elle n'a
 * pas encore rendu, jamais moins que zéro — sans quoi le même euro serait
 * retranché deux fois, et le client sous-remboursé.
 *
 * Un reste nul ou négatif ne rend rien : un facturable plus haut que
 * l'encaissé (des frais de retard non encaissés) ne se réclame pas ici, et
 * la facture carte, dont l'égalité ne tombe pas, reste `blocked`.
 */
export function shortfallRefundOf(
  subject: ShortfallRefundSubject,
  money: ShortfallRefundMoney,
): ShortfallRefundVerdict {
  const gate = shortfallRefundGateOf(subject);
  if (gate !== null) {
    return gate;
  }
  if (money.unattributedRefundedCents > 0) {
    return blocked("unattributed_refund", null);
  }
  const amountCents =
    money.chargedCents -
    money.adjustmentRefundedCents -
    pendingAdjustmentCentsOf(money) -
    (subject.billableTotalCents ?? 0);
  if (amountCents <= 0) {
    return NONE;
  }
  if (money.unpaid) {
    return blocked("payment_not_paid", amountCents);
  }
  const split = splitRefund({
    refundCents: amountCents,
    payments: money.payments,
    openRequests: money.requests.filter((request) => OPEN_STATES.has(request.state)),
  });
  return split.kind === "uncovered"
    ? blocked("not_covered", amountCents, split.hasStoppedAmount)
    : { kind: "refund", amountCents, parts: split.parts };
}

/**
 * Ce que les demandes d'ajustement ouvertes annoncent encore : pour chacune,
 * l'annoncé moins le réussi qui lui est déjà rattaché, jamais négatif.
 */
export function pendingAdjustmentCentsOf(money: ShortfallRefundMoney): number {
  const succeededBy = new Map<string, number>();
  for (const refund of money.succeeded) {
    if (refund.requestId !== null) {
      succeededBy.set(
        refund.requestId,
        (succeededBy.get(refund.requestId) ?? 0) + refund.amountCents,
      );
    }
  }
  return money.requests
    .filter((request) => request.nature === "adjustment" && OPEN_STATES.has(request.state))
    .reduce(
      (sum, request) =>
        sum + Math.max(0, request.announcedCents - (succeededBy.get(request.requestId) ?? 0)),
      0,
    );
}

function blocked(
  cause: ShortfallRefundCause,
  amountCents: number | null,
  stoppedAmount = false,
): ShortfallRefundVerdict {
  return { kind: "blocked", cause, amountCents, stoppedAmount };
}

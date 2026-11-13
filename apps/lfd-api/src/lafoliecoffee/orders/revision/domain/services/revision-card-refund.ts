import type { OpenCardRefundRequest } from "../../../../../card-payment/channels/requests/index.js";
import type { RevisionActor } from "../entities/order-revision.js";
import { CardRefundNotCoveredError } from "../errors/revision-card-refund-errors.js";

/** Un paiement qui se rend (plan S1, R4) et ce qui reste à y rendre. */
export interface RefundablePayment {
  readonly paymentId: string;
  readonly remainderCents: number;
}

/** Une demande de remboursement non terminale, telle que la position la décrit. */
export type OpenRefundRequestShape = Pick<OpenCardRefundRequest, "paymentId" | "form" | "state">;

/** La part d'une baisse rendue sur un paiement. */
export interface CardRefundPart {
  readonly paymentId: string;
  readonly amountCents: number;
}

/** Ce que la répartition lit : tout est relu sous le verrou `orders` par l'appelant. */
export interface CardRefundSplitInput {
  readonly orderId: string;
  readonly refundCents: number;
  /** Les paiements de R4 SEULEMENT, du plus ancien au plus récent. */
  readonly payments: readonly RefundablePayment[];
  /** Les demandes non terminales du sujet — filtrées ici sur les paiements de R4. */
  readonly openRequests: readonly OpenRefundRequestShape[];
  readonly by: RevisionActor["kind"];
}

/** Le reste d'un paiement couvert : les parts ; sinon, ce qu'il faut pour dire la sortie. */
export type CardRefundSplit =
  | { readonly kind: "split"; readonly parts: readonly CardRefundPart[] }
  | { readonly kind: "uncovered"; readonly hasStoppedAmount: boolean };

/** Ce que la répartition pure lit — sans l'acteur, qui ne sert qu'au message du refus. */
export type RefundSplitInput = Omit<CardRefundSplitInput, "orderId" | "by">;

/**
 * **Répartir un montant sur les paiements qui se rendent** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12 ;
 * partagé avec le reste d'un départ incomplet, plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2) — pure,
 * sans lever : du plus récent au plus ancien, chacun jusqu'à son reste, et la
 * somme des parts vaut EXACTEMENT `refundCents`. Un complément payé en
 * dernier rend donc d'abord (R9 : 52 − 8 = 44, la facture tombe juste).
 *
 * Restes insuffisants : `uncovered`, avec `hasStoppedAmount` — une demande
 * `amount` arrêtée parmi les paiements visés seulement (une demande arrêtée
 * sur un complément refusé ou clos n'est pas la sortie de ce montant).
 */
export function splitRefund(input: RefundSplitInput): CardRefundSplit {
  const parts: CardRefundPart[] = [];
  let left = input.refundCents;
  for (const payment of [...input.payments].reverse()) {
    if (left === 0) {
      break;
    }
    const amountCents = Math.min(left, Math.max(payment.remainderCents, 0));
    if (amountCents > 0) {
      parts.push({ paymentId: payment.paymentId, amountCents });
      left -= amountCents;
    }
  }
  return left > 0
    ? { kind: "uncovered", hasStoppedAmount: hasStoppedAmount(input) }
    : { kind: "split", parts };
}

/**
 * **La répartition d'une baisse**, qui refuse : {@link splitRefund}, dont
 * `uncovered` devient le refus de la révision avec son geste de sortie.
 *
 * @throws {CardRefundNotCoveredError} les restes ne couvrent pas la baisse.
 */
export function splitCardRefund(input: CardRefundSplitInput): readonly CardRefundPart[] {
  const split = splitRefund(input);
  if (split.kind === "uncovered") {
    throw new CardRefundNotCoveredError(input.orderId, split.hasStoppedAmount, input.by);
  }
  return split.parts;
}

function hasStoppedAmount(input: RefundSplitInput): boolean {
  const refundable = new Set(input.payments.map((payment) => payment.paymentId));
  return input.openRequests.some(
    (request) =>
      refundable.has(request.paymentId) && request.form === "amount" && request.state === "stopped",
  );
}

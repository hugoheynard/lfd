import { RefundRejectedError } from "../errors/order-refund-errors.js";
import {
  REFUND_CURRENCY,
  refundTransition,
  type OrderRefundState,
  type RefundReport,
} from "./order-refund.js";

/** Le règlement d'une commande, tel que l'énumération `PaymentStatus` le dit. */
export type LedgerPaymentStatus = "not_required" | "pending" | "paid" | "failed" | "refunded";

/** Ce que le carnet sait de la commande quand on le charge. */
export interface OrderRefundLedgerState {
  readonly orderId: string;
  readonly orderNumber: string;
  /**
   * Le total encaissé, en centimes : `orders.total_cents`, sur lequel
   * l'intention Stripe est dimensionnée (`order-settlement.ts`, vérifié le
   * 2026-10-08). Un remboursement ne se mesure qu'à lui.
   */
  readonly chargedCents: number;
  readonly paymentStatus: LedgerPaymentStatus;
  readonly refunds: readonly OrderRefundState[];
}

/**
 * Ce que le constat d'un remboursement a changé au règlement :
 *
 * - `fully_refunded` — le cumul réussi atteint le total : `paid` → `refunded` ;
 * - `restored` — un remboursement réussi a échoué depuis : `refunded` → `paid` ;
 * - `unchanged` — remboursement partiel, ou commande dont le règlement n'est
 *   ni `paid` ni `refunded` (une commande annulée encaissée après coup reste
 *   `failed` : `markPaid` ne la rouvre jamais).
 */
export type RefundSettlement = "fully_refunded" | "restored" | "unchanged";

/** L'issue d'un constat. Un refus, lui, LÈVE ({@link RefundRejectedError}). */
export type RefundRecording =
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "recorded";
      readonly refund: OrderRefundState;
      /** Le cumul des remboursements RÉUSSIS, après ce constat. */
      readonly refundedCents: number;
      readonly settlement: RefundSettlement;
    };

/**
 * **Le carnet des remboursements d'une commande** — l'agrégat qui tient les
 * règles du lot R1 (plan `plan-facture-carte-et-remboursements.md`, § 2 bis-3,
 * § 3) :
 *
 * - **idempotent par `stripe_refund_id`** : un webhook rejoué ne double rien ;
 * - **un statut ne régresse pas** (`refundTransition`) ;
 * - **euros seulement** ;
 * - **Σ des `succeeded` ≤ total encaissé** : un excès est une panne qui se
 *   voit, jamais une écriture fausse ;
 * - **`paymentStatus` suit le cumul** : `refunded` quand il atteint le total,
 *   de nouveau `paid` si un remboursement réussi échoue ensuite.
 *
 * Il ne porte que les remboursements et le règlement : le reste de la commande
 * n'a rien à refuser ici.
 */
export class OrderRefundLedger {
  private constructor(
    readonly orderId: string,
    readonly orderNumber: string,
    readonly chargedCents: number,
    private status: LedgerPaymentStatus,
    private readonly refunds: OrderRefundState[],
  ) {}

  static reconstitute(state: OrderRefundLedgerState): OrderRefundLedger {
    return new OrderRefundLedger(
      state.orderId,
      state.orderNumber,
      state.chargedCents,
      state.paymentStatus,
      [...state.refunds],
    );
  }

  get paymentStatus(): LedgerPaymentStatus {
    return this.status;
  }

  /** Le cumul des remboursements réussis, en centimes. */
  refundedCents(): number {
    return succeededSum(this.refunds);
  }

  /**
   * Constate un remboursement annoncé par Stripe.
   *
   * @param newId l'identifiant à donner à la ligne si le remboursement est
   * nouveau ; ignoré sinon.
   * @param at l'instant du constat (`Clock`).
   * @throws {RefundRejectedError} devise étrangère, cumul au-delà du total,
   * montant changé, ou retour d'un remboursement réussi à « annulé ».
   */
  record(report: RefundReport, newId: string, at: Date): RefundRecording {
    if (report.currency !== REFUND_CURRENCY) {
      throw new RefundRejectedError("currency");
    }
    const index = this.refunds.findIndex((r) => r.stripeRefundId === report.stripeRefundId);
    const next = index === -1 ? created(report, newId, at) : this.updated(index, report, at);
    if (next === null) {
      return { kind: "unchanged" };
    }
    const after =
      index === -1
        ? [...this.refunds, next]
        : this.refunds.map((refund, i) => (i === index ? next : refund));
    const refundedCents = succeededSum(after);
    if (refundedCents > this.chargedCents) {
      throw new RefundRejectedError("exceeds_charge");
    }
    this.refunds.splice(0, this.refunds.length, ...after);
    return {
      kind: "recorded",
      refund: next,
      refundedCents,
      settlement: this.settle(refundedCents),
    };
  }

  /** Les remboursements, dans l'ordre de leur constat. */
  toPersistence(): {
    readonly paymentStatus: LedgerPaymentStatus;
    readonly refunds: readonly OrderRefundState[];
  } {
    return { paymentStatus: this.status, refunds: [...this.refunds] };
  }

  /** Le remboursement connu à `index`, sous son nouveau statut — ou `null` s'il ne change pas. */
  private updated(index: number, report: RefundReport, at: Date): OrderRefundState | null {
    const known = this.refunds[index];
    if (known === undefined) {
      return null;
    }
    if (known.amountCents !== report.amountCents) {
      throw new RefundRejectedError("amount_changed");
    }
    const transition = refundTransition(known.status, report.status);
    if (transition === "illegal") {
      throw new RefundRejectedError("reversed_after_success");
    }
    return transition === "stale" ? null : { ...known, status: report.status, updatedAt: at };
  }

  private settle(refundedCents: number): RefundSettlement {
    if (this.status === "paid" && refundedCents === this.chargedCents) {
      this.status = "refunded";
      return "fully_refunded";
    }
    if (this.status === "refunded" && refundedCents < this.chargedCents) {
      this.status = "paid";
      return "restored";
    }
    return "unchanged";
  }
}

function created(report: RefundReport, id: string, at: Date): OrderRefundState {
  return {
    id,
    stripeRefundId: report.stripeRefundId,
    amountCents: report.amountCents,
    currency: report.currency,
    status: report.status,
    refundedAt: report.refundedAt,
    recordedAt: at,
    updatedAt: at,
    creditNoteId: null,
  };
}

function succeededSum(refunds: readonly OrderRefundState[]): number {
  return refunds
    .filter((refund) => refund.status === "succeeded")
    .reduce((sum, refund) => sum + refund.amountCents, 0);
}

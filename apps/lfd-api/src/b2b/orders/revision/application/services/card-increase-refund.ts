import { Injectable } from "@nestjs/common";

import {
  CardRefunds,
  CardSettlementReader,
} from "../../../../../card-payment/channels/requests/index.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { ComplementWithoutProposalError } from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { OrderLock } from "../../../domain/ports/order-lock.js";
import { CardIncreaseBell } from "./card-increase-bell.js";
import { increaseAlreadyReturnedFact } from "./card-increase-facts.js";
import { IncreaseOrderLabels } from "../../../application/services/increase-order-labels.js";

/**
 * Les deux raisons d'un complément rendu (R8) — 🔴 des valeurs écrites
 * (`card_payment.refund_request.reason`), qui ne se renomment plus (§2.9).
 */
export type ComplementReturnReason = "late_payment" | "revision_refused";

/** Le complément à rendre, tel que le fait durable le porte. */
export interface ComplementToReturn {
  readonly orderId: string;
  readonly proposalId: string;
  readonly paymentId: string;
  readonly complementCents: number;
}

/** Ce qui est parti : tout, rien (déjà rendu), ou une partie. */
export type ComplementReturn = "returned" | "already_returned" | "partly_returned";

/**
 * **Rendre ce qui reste du complément, et le dire** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.8) —
 * partagé par les deux abonnés (`RefundLateComplement`,
 * `RefundRefusedIncrease`), dans l'unité de travail de leur reçu.
 *
 * Sous le verrou `orders` — celui de l'annulation —, le reste du paiement du
 * complément ne baisse pas entre la lecture et la demande :
 *
 * - reste = complément ⇒ la demande du complément ;
 * - reste nul ⇒ le journal `order.card_increase_already_returned` (l'annulation
 *   a tout rendu), sortie normale ;
 * - reste partiel ⇒ la demande du reste, et la cloche.
 *
 * Toujours un **ajustement** (la facture carte le retranche : encaissé 52 −
 * ajusté 12 = 40), jamais `requestRemainder` sur le sujet ; automatique
 * (`requestedBy: null`). `CardRefundAmountExceedsRemainderError` reste le
 * filet : elle lève, et la boîte d'envoi rejoue.
 */
@Injectable()
export class CardIncreaseRefund {
  constructor(
    private readonly lock: OrderLock,
    private readonly settlements: CardSettlementReader,
    private readonly refunds: CardRefunds,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly labels: IncreaseOrderLabels,
    private readonly journal: Journal,
    private readonly bell: CardIncreaseBell,
  ) {}

  /** @throws {ComplementWithoutProposalError} aucun projet ne porte ce paiement. */
  async returnRemainder(
    complement: ComplementToReturn,
    reason: ComplementReturnReason,
  ): Promise<ComplementReturn> {
    await this.lock.lock(complement.orderId);
    const proposal = await this.proposals.lockByPayment(complement.paymentId);
    if (proposal === null || proposal.id !== complement.proposalId) {
      throw new ComplementWithoutProposalError(complement.orderId, complement.paymentId);
    }
    const label = await this.labels.of(complement.orderId);
    const remainder = await this.settlements.remainderOf(complement.paymentId);
    if (remainder <= 0) {
      await this.journal.append(increaseAlreadyReturnedFact(proposal, label));
      return "already_returned";
    }
    const amountCents = Math.min(remainder, complement.complementCents);
    await this.refunds.requestAmount({
      paymentId: complement.paymentId,
      amountCents,
      nature: "adjustment",
      reason,
      requestedBy: null,
    });
    if (amountCents < complement.complementCents) {
      await this.bell.ring(proposal, label, "partly_returned");
      return "partly_returned";
    }
    return "returned";
  }
}

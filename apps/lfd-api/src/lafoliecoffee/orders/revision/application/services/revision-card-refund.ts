import { Injectable } from "@nestjs/common";

import { CardRefunds } from "../../../../../card-payment/channels/requests/index.js";
import type { RevisableOrder, RevisionActor } from "../../domain/entities/order-revision.js";
import type { RevisionSettlement } from "../../domain/entities/revision-settlement.js";
import { RevisionProposalPendingError } from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { isCardSettlement } from "../../domain/services/order-revisability.js";
import {
  type CardRefundPart,
  splitCardRefund,
} from "../../domain/services/revision-card-refund.js";
import { RefundablePayments } from "../../../application/services/refundable-payments.js";

/**
 * Le code de la demande — 🔴 une valeur écrite
 * (`card_payment.refund_request.reason`), qui ne se renomme plus (plan S1, §2.3).
 */
export const REVISION_REFUND_REASON = "revision";

/** Aucune part : la révision ne rend rien. */
const NOTHING: readonly CardRefundPart[] = [];

/**
 * **L'argent d'une révision carte, dans M1** (plan
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.12) — le
 * handler l'appelle à trois moments, et l'ordre est la règle (R5) :
 *
 * 1. {@link ensureNoLiveIncrease}, hors verrou : un projet de hausse vivant
 *    refuse la baisse et le total égal (R3) ;
 * 2. {@link prepare}, sous `revisions.lock` et AVANT toute écriture : R3
 *    rejugé, le premier paiement adopté s'il manque, les restes lus, la
 *    répartition calculée — ou le refus ;
 * 3. {@link request}, APRÈS l'écriture de la révision : une demande `amount`
 *    par paiement touché. Sous le verrou `orders`, que prennent tous les
 *    écrivains de `card-payment`, les restes n'ont pas bougé depuis 2 :
 *    `CardRefundAmountExceedsRemainderError` n'est plus qu'un filet.
 *
 * Aucun appel réseau : l'exécuteur du bloc carte part après validation.
 */
@Injectable()
export class RevisionCardRefund {
  constructor(
    private readonly proposals: CardIncreaseProposalReader,
    private readonly lockedProposals: CardIncreaseProposalRepository,
    private readonly refundables: RefundablePayments,
    private readonly refunds: CardRefunds,
  ) {}

  /**
   * R3, hors verrou — seulement sur une commande carte : une autre n'a jamais de projet.
   *
   * @throws {RevisionProposalPendingError} un complément attend son paiement ou son application.
   */
  async ensureNoLiveIncrease(order: RevisableOrder): Promise<void> {
    if (!isCardSettlement(order.paymentStatus, order.totalCents)) {
      return;
    }
    const live = await this.proposals.liveOf(order.orderId);
    if (live !== null) {
      throw new RevisionProposalPendingError(order.orderId, live.state);
    }
  }

  /**
   * R3 rejugé, R4, R6 — sous le verrou `orders` que l'appelant tient.
   * `settlement` est celui que la composition a remonté (R5 bis) : la seule
   * source du montant à rendre.
   *
   * @throws {RevisionProposalPendingError} un projet est né entre-temps.
   * @throws {CardRefundNotCoveredError} les restes ne couvrent pas la baisse.
   */
  async prepare(
    locked: RevisableOrder,
    settlement: RevisionSettlement,
    by: RevisionActor["kind"],
  ): Promise<readonly CardRefundPart[]> {
    if (!isCardSettlement(locked.paymentStatus, locked.totalCents)) {
      return NOTHING;
    }
    const live = await this.lockedProposals.lockLiveOf(locked.orderId);
    if (live !== null) {
      throw new RevisionProposalPendingError(locked.orderId, live.state);
    }
    if (settlement.kind !== "card_refund") {
      return NOTHING;
    }
    // R4 : le premier paiement adopté s'il manque, dans la transaction
    // ambiante — sans quoi son reste vaudrait 0 et le refus mentirait.
    const { payments, position } = await this.refundables.of(locked.orderId, "adopt");
    return splitCardRefund({
      orderId: locked.orderId,
      refundCents: settlement.refundCents,
      payments,
      openRequests: position?.openRequests ?? [],
      by,
    });
  }

  /** R5, après l'écriture : une demande d'ajustement par paiement touché. */
  async request(parts: readonly CardRefundPart[], actor: RevisionActor): Promise<void> {
    for (const part of parts) {
      await this.refunds.requestAmount({
        paymentId: part.paymentId,
        amountCents: part.amountCents,
        nature: "adjustment",
        reason: REVISION_REFUND_REASON,
        requestedBy: actor.kind === "staff" ? actor.staffId : null,
      });
    }
  }
}

import type { CardComplementPaymentView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CardPayments } from "../../../../card-payment/channels/requests/index.js";
import { NoComplementAwaitingPaymentError } from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { RevisionWall } from "../services/revision-wall.js";
import { GetComplementPaymentQuery } from "./get-complement-payment.query.js";

/**
 * Sert le complément qui attend son paiement : le projet vivant doit être
 * `awaiting_payment`, et son intention, relue chez le prestataire
 * (`cards.retrieve`, jamais un secret gardé chez nous), ni annulée ni déjà
 * encaissée. Ne mute rien.
 *
 * @throws {OrderNotFoundError} inconnue, ou hors du mur du client.
 * @throws {NoComplementAwaitingPaymentError} rien à payer.
 */
@QueryHandler(GetComplementPaymentQuery)
export class GetComplementPaymentHandler implements IQueryHandler<
  GetComplementPaymentQuery,
  CardComplementPaymentView
> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly reader: CardIncreaseProposalReader,
    private readonly cards: CardPayments,
  ) {}

  async execute(query: GetComplementPaymentQuery): Promise<CardComplementPaymentView> {
    const order = await this.wall.find(query.orderId, {
      kind: "customer",
      userId: query.actorUserId,
    });
    const live = await this.reader.liveOf(order.orderId);
    if (live === null || live.state !== "awaiting_payment") {
      throw new NoComplementAwaitingPaymentError(order.orderId);
    }
    const state = live.toPersistence();
    const payment = await this.cards.retrieve(state.paymentId);
    if (payment.state === "canceled" || payment.state === "succeeded") {
      throw new NoComplementAwaitingPaymentError(order.orderId);
    }
    return {
      proposalId: live.id,
      complementCents: live.complementCents,
      clientSecret: payment.clientSecret,
      publishableKey: payment.publishableKey,
      expiresAt: state.expiresAt.toISOString(),
    };
  }
}

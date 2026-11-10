import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { NoComplementAwaitingPaymentError } from "../../domain/errors/card-increase-proposal-errors.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { OrderLock } from "../../domain/ports/order-lock.js";
import { CardIncreaseAbandonment } from "../services/card-increase-abandonment.js";
import { RevisionWall } from "../services/revision-wall.js";
import { AbandonCardIncreaseCommand } from "./abandon-card-increase.command.js";

/**
 * **« Abandonner » le complément** (plan `plan-s2-la-hausse.md`, §2.5) :
 *
 * 1. le mur (`ensureOrderVisible` pour le client, la porte staff pour
 *    l'équipe), puis le projet vivant, qui doit attendre son paiement ;
 * 2. HORS transaction, l'intention annulée chez le prestataire ;
 * 3. sous le verrou `orders`, le projet `abandoned` par une écriture
 *    conditionnée, la cause au journal (`customer` ou `staff`).
 *
 * @throws {NoComplementAwaitingPaymentError} aucun complément n'attend de paiement.
 * @throws {CardComplementJustPaidError} il vient d'être payé.
 * @throws {CardComplementCancellationUnavailableError} le prestataire ne répond pas.
 */
@CommandHandler(AbandonCardIncreaseCommand)
export class AbandonCardIncreaseHandler implements ICommandHandler<AbandonCardIncreaseCommand> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly reader: CardIncreaseProposalReader,
    private readonly abandonment: CardIncreaseAbandonment,
    private readonly lock: OrderLock,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: AbandonCardIncreaseCommand): Promise<void> {
    const order = await this.wall.find(command.orderId, command.actor);
    const live = await this.reader.liveOf(order.orderId);
    if (live === null || live.state !== "awaiting_payment") {
      throw new NoComplementAwaitingPaymentError(order.orderId);
    }
    await this.abandonment.cancelIntent(live);
    const label = { orderId: order.orderId, orderNumber: order.orderNumber };
    await this.unitOfWork.run(async () => {
      await this.lock.lock(order.orderId);
      await this.abandonment.abandonLocked(live, label, command.actor.kind);
    });
  }
}

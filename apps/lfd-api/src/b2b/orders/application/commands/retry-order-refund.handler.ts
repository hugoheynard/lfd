import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { WallClock } from "../../../../platform/time/wall-clock.js";
import { refundRequestStateOf } from "../../domain/entities/order-refund-request.js";
import {
  RefundRequestAlreadyRefundedError,
  RefundRequestAwaitingBankError,
  RefundRequestInProgressError,
  RefundRequestNotFoundError,
} from "../../domain/errors/order-refund-request-errors.js";
import { OrderRefundRequestRepository } from "../../domain/ports/order-refund-request.repository.js";
import { OrderRefundRepository } from "../../domain/ports/order-refund.repository.js";
import { OrderRefundDispatch } from "../services/order-refund-dispatch.js";
import { RetryOrderRefundCommand } from "./retry-order-refund.command.js";

/**
 * Sous le verrou de la ligne `orders` : la demande relue, l'état lu au
 * carnet, et les refus nommés — pas de demande, déjà remboursée, émise et en
 * attente de la banque, ou bail tenu (« Stripe traite déjà »). Sinon
 * l'échéance passe à maintenant (horloge murale) et l'exécuteur part après
 * validation. Une génération échouée est rouverte PAR L'EXÉCUTEUR, sous son
 * bail : ce handler n'en ouvre aucune.
 */
@CommandHandler(RetryOrderRefundCommand)
export class RetryOrderRefundHandler implements ICommandHandler<RetryOrderRefundCommand, void> {
  constructor(
    private readonly ledgers: OrderRefundRepository,
    private readonly requests: OrderRefundRequestRepository,
    private readonly dispatch: OrderRefundDispatch,
    private readonly unitOfWork: UnitOfWork,
    private readonly wall: WallClock,
  ) {}

  async execute(command: RetryOrderRefundCommand): Promise<void> {
    await this.unitOfWork.run(async () => {
      const ledger = await this.ledgers.loadByOrder(command.orderId);
      const request = await this.requests.load(command.orderId);
      if (ledger === null || request === null) {
        throw new RefundRequestNotFoundError(command.orderId);
      }
      const wallNow = this.wall.elapsedNow();
      if (request.isClaimedAt(wallNow)) {
        throw new RefundRequestInProgressError(command.orderId);
      }
      const state = refundRequestStateOf(request, ledger.view());
      if (state === "refunded") {
        throw new RefundRequestAlreadyRefundedError(command.orderId);
      }
      if (state === "issued") {
        throw new RefundRequestAwaitingBankError(command.orderId);
      }
      request.scheduleAt(wallNow);
      await this.requests.save(request);
      this.dispatch.afterCommitFor(command.orderId);
    });
  }
}

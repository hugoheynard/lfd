import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { WallClock } from "../../../../platform/time/wall-clock.js";
import { OrderRefundRequestReader } from "../../domain/ports/order-refund-request.reader.js";
import { OrderRefundDispatch } from "../services/order-refund-dispatch.js";
import {
  REFUND_SWEEP_LIMIT,
  SweepOrderRefundsCommand,
  type OrderRefundSweepReport,
} from "./sweep-order-refunds.command.js";

/**
 * Reprend les demandes sans `re_…` dont l'échéance est passée, par ordre
 * d'échéance, une à une : l'exécuteur prend son bail pour chacune, et une
 * demande qu'un autre tient est simplement sautée. Hors de toute transaction ;
 * l'échec de l'une ne prive pas les suivantes de leur tour.
 *
 * L'échéance se compare à l'horloge MURALE : celle d'une demande neuve est
 * l'instant de l'annulation (`Clock`), toujours derrière le mur.
 */
@CommandHandler(SweepOrderRefundsCommand)
export class SweepOrderRefundsHandler implements ICommandHandler<
  SweepOrderRefundsCommand,
  OrderRefundSweepReport
> {
  private readonly logger = new Logger(SweepOrderRefundsHandler.name);

  constructor(
    private readonly reader: OrderRefundRequestReader,
    private readonly dispatch: OrderRefundDispatch,
    private readonly wall: WallClock,
  ) {}

  async execute(): Promise<OrderRefundSweepReport> {
    const due = await this.reader.dueForSweep(this.wall.elapsedNow(), REFUND_SWEEP_LIMIT);
    for (const orderId of due) {
      try {
        await this.dispatch.issueNow(orderId);
      } catch (error) {
        this.logger.error(`Remboursement non repris (commande ${orderId})`, error);
      }
    }
    return { taken: due.length };
  }
}

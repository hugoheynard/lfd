import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { WallClock } from "../../../platform/time/wall-clock.js";
import { CardRefundSweepReader } from "../../domain/ports/card-refund-sweep.reader.js";
import { CardRefundDispatch } from "../refunds/card-refund-dispatch.js";
import {
  CARD_REFUND_SWEEP_LIMIT,
  type CardRefundSweepReport,
  SweepCardRefundsCommand,
} from "./sweep-card-refunds.command.js";

/**
 * Reprend les demandes `to_issue` dont l'échéance est passée, par ordre
 * d'échéance, une à une : l'exécuteur prend son bail pour chacune, et une
 * demande qu'un autre tient est simplement sautée. Hors de toute transaction ;
 * l'échec de l'une ne prive pas les suivantes de leur tour. L'échéance se
 * compare à l'horloge MURALE.
 *
 * @sans-journal Il n'écrit rien lui-même : chaque reprise passe par
 * l'exécuteur, dont l'issue est journalisée par `CardRefundIssuanceRecorder`.
 */
@CommandHandler(SweepCardRefundsCommand)
export class SweepCardRefundsHandler implements ICommandHandler<
  SweepCardRefundsCommand,
  CardRefundSweepReport
> {
  private readonly logger = new Logger(SweepCardRefundsHandler.name);

  constructor(
    private readonly reader: CardRefundSweepReader,
    private readonly dispatch: CardRefundDispatch,
    private readonly wall: WallClock,
  ) {}

  async execute(): Promise<CardRefundSweepReport> {
    const due = await this.reader.dueForSweep(this.wall.elapsedNow(), CARD_REFUND_SWEEP_LIMIT);
    for (const requestId of due) {
      try {
        await this.dispatch.issueNow(requestId);
      } catch (error) {
        this.logger.error(`Remboursement non repris (demande ${requestId})`, error);
      }
    }
    return { taken: due.length };
  }
}

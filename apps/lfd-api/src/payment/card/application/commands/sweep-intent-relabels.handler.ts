import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { WallClock } from "../../../../platform/time/wall-clock.js";
import { IntentRelabelQueue } from "../../domain/ports/intent-relabel-queue.reader.js";
import { IntentRelabelPoster } from "../labels/intent-relabel-poster.js";
import {
  INTENT_RELABEL_SWEEP_LIMIT,
  type IntentRelabelSweepReport,
  SweepIntentRelabelsCommand,
} from "./sweep-intent-relabels.command.js";

/**
 * Reprend les libellés dus, le plus ancien d'abord, un à un. Hors de toute
 * transaction ; l'échec de l'un ne prive pas les suivants de leur tour.
 * L'échéance se compare à l'horloge MURALE.
 *
 * @sans-journal Un libellé de pointage n'est pas un fait métier : l'abandon
 * est journalisé par le poseur, par identifiants seuls.
 */
@CommandHandler(SweepIntentRelabelsCommand)
export class SweepIntentRelabelsHandler implements ICommandHandler<
  SweepIntentRelabelsCommand,
  IntentRelabelSweepReport
> {
  private readonly logger = new Logger(SweepIntentRelabelsHandler.name);

  constructor(
    private readonly queue: IntentRelabelQueue,
    private readonly poster: IntentRelabelPoster,
    private readonly wall: WallClock,
  ) {}

  async execute(): Promise<IntentRelabelSweepReport> {
    const due = await this.queue.due(this.wall.elapsedNow(), INTENT_RELABEL_SWEEP_LIMIT);
    let posted = 0;
    let abandoned = 0;
    for (const paymentId of due) {
      try {
        const posting = await this.poster.post(paymentId);
        posted += posting === "posted" ? 1 : 0;
        abandoned += posting === "abandoned" ? 1 : 0;
      } catch (error) {
        this.logger.error(`Libellé non repris (paiement ${paymentId})`, error);
      }
    }
    return { taken: due.length, posted, abandoned };
  }
}

import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { describePurge, type PurgeReport, runPurge } from "../retention/purge-mode.js";
import { Clock } from "../time/clock.js";
import { GestureIntentPruner } from "./gesture-intent-pruner.js";
import {
  GESTURE_INTENT_PURGE_BATCH_SIZE,
  gestureIntentPurgeCutoff,
} from "./gesture-intent-retention.js";
import { PurgeGestureIntentsCommand } from "./purge-gesture-intents.command.js";

/**
 * La purge du registre des intentions, toujours active : Hugo a décidé la
 * durée le 2026-11-12, et une intention purgée n'emporte aucun fait métier —
 * seulement la reconnaissance d'un rejeu de plus de sept jours.
 *
 * @sans-journal un nettoyage technique déclenché par la machine : aucun acte
 * de personne, aucun fait métier ne change ; le compte rendu est sa trace.
 */
@CommandHandler(PurgeGestureIntentsCommand)
export class PurgeGestureIntentsHandler implements ICommandHandler<
  PurgeGestureIntentsCommand,
  PurgeReport
> {
  private readonly logger = new Logger(PurgeGestureIntentsHandler.name);

  constructor(
    private readonly pruner: GestureIntentPruner,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<PurgeReport> {
    const cutoff = gestureIntentPurgeCutoff(this.clock.now());
    const report = await runPurge("on", this.pruner, cutoff, GESTURE_INTENT_PURGE_BATCH_SIZE);
    this.logger.log(describePurge("intentions des gestes (réclamées depuis 7 jours)", report));
    return report;
  }
}

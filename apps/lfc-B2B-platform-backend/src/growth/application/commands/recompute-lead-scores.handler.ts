import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { deriveLeadScores } from "../../domain/lead-score.js";
import { LeadEventSource } from "../../domain/ports/lead-event-source.js";
import { LeadScoreStore } from "../../domain/ports/lead-score.store.js";
import { RecomputeLeadScoresCommand } from "./recompute-lead-scores.command.js";

/**
 * Orchestre le recompute batch : lit tout le journal (`LeadEventSource`),
 * délègue le calcul à la fonction **pure** `deriveLeadScores` (temps du `Clock`,
 * déterministe), puis remplace le read-model d'un bloc (`LeadScoreStore`). Aucune
 * logique propre — que de la composition de ports. Retourne le nombre de leads
 * scorés (observabilité du cron).
 */
@CommandHandler(RecomputeLeadScoresCommand)
export class RecomputeLeadScoresHandler implements ICommandHandler<
  RecomputeLeadScoresCommand,
  number
> {
  constructor(
    private readonly source: LeadEventSource,
    private readonly store: LeadScoreStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const events = await this.source.all();
    const rows = deriveLeadScores(events, this.clock.now());
    await this.store.replaceAll(rows);
    return rows.length;
  }
}

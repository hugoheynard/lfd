import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { companyIdsOf } from "../../domain/activation.js";
import { deriveLeadScores } from "../../domain/lead-score.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { LeadEventSource } from "../../domain/ports/lead-event-source.js";
import { LeadReader } from "../../domain/ports/lead.reader.js";
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
    private readonly leads: LeadReader,
    private readonly store: LeadScoreStore,
    private readonly clock: Clock,
    private readonly companies: CompanyNamer,
  ) {}

  async execute(): Promise<number> {
    const [events, coldLeads] = await Promise.all([this.source.all(), this.leads.list()]);
    // L'annuaire se demande APRÈS le journal : c'est lui qui dit quelles
    // sociétés sont dans le tunnel. Une lecture de plus par passe de cron, pas
    // une par dossier.
    const companyNames = await this.companies.namesOf(
      companyIdsOf(events.filter((event) => event.subjectType === "company")),
    );
    const rows = deriveLeadScores(events, this.clock.now(), coldLeads, companyNames);
    await this.store.replaceAll(rows);
    return rows.length;
  }
}

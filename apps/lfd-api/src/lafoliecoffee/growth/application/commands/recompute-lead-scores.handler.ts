import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { companyIdsOf } from "../../domain/activation.js";
import { deriveLeadScores } from "../../domain/lead-score.js";
import { ArchivedCompaniesReader } from "../../domain/ports/archived-companies.reader.js";
import { CompanyNamer } from "../../domain/ports/company-namer.js";
import { LeadEventSource } from "../../domain/ports/lead-event-source.js";
import { LeadReader } from "../../domain/ports/lead.reader.js";
import { LeadScoreStore } from "../../domain/ports/lead-score.store.js";
import { RecomputeLeadScoresCommand } from "./recompute-lead-scores.command.js";

/**
 * Orchestre le recompute batch : lit tout le journal (`LeadEventSource`),
 * délègue le calcul à la fonction **pure** `deriveLeadScores` (temps du `Clock`,
 * déterministe), puis remplace le read-model d'un bloc (`LeadScoreStore`). Un
 * compte supprimé n'est pas un dossier à relancer : ses faits sont écartés
 * avant le calcul (`ArchivedCompaniesReader`). Aucune
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
    private readonly archived: ArchivedCompaniesReader,
  ) {}

  async execute(): Promise<number> {
    const [journal, coldLeads] = await Promise.all([this.source.all(), this.leads.list()]);
    const archived = await this.archived.among(
      companyIdsOf(journal.filter((event) => event.subjectType === "company")),
    );
    const events = journal.filter(
      (event) => event.subjectType !== "company" || !archived.has(event.subjectId),
    );
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

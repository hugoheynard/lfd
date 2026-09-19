import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { ActivityPageView } from "@lfd/contracts";

import { StaffAuthorReferences } from "../../../../staff/directory/domain/staff-author-directory.js";
import { ActivityJournalReader } from "../../domain/ports/activity-journal.reader.js";
import { ReadActivityJournalQuery } from "./read-activity-journal.query.js";

/**
 * Lecture du journal. Le filtre et la pagination appartiennent à la base ; le
 * seul travail d'ici est d'élargir le filtre par acteur à **toutes** les
 * références de la personne — son id de fiche et chacun de ses `sub` — pour
 * que son histoire ne se coupe pas entre deux identifiants pendant la bascule
 * (`architecture-journalisation.md` §12, D4). `actorId` reste servi et reste
 * la clé du filtre : ce sont ses synonymes qui s'ajoutent.
 */
@QueryHandler(ReadActivityJournalQuery)
export class ReadActivityJournalHandler implements IQueryHandler<
  ReadActivityJournalQuery,
  ActivityPageView
> {
  constructor(
    private readonly journal: ActivityJournalReader,
    private readonly authors: StaffAuthorReferences,
  ) {}

  async execute(query: ReadActivityJournalQuery): Promise<ActivityPageView> {
    const { actorId } = query.filters;
    const actorIds = actorId === undefined ? null : await this.authors.referencesOf(actorId);
    // Le journal entier : `activity:read` n'a pas de tranche.
    return this.journal.page(query.filters, actorIds, null);
  }
}

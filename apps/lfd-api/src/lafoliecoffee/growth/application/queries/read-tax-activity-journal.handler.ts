import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { ActivityPageView } from "@lfd/contracts";

import { StaffAuthorReferences } from "../../../../staff/directory/domain/staff-author-directory.js";
import { TAX_JOURNAL_SLICE } from "../../domain/activity-slice.js";
import { ActivityJournalReader } from "../../domain/ports/activity-journal.reader.js";
import { ReadTaxActivityJournalQuery } from "./read-tax-activity-journal.query.js";

/**
 * Lecture de la **tranche fiscale** (plan du journal, lot 4, 2026-09-19) : le
 * même lecteur que le journal entier, borné par {@link TAX_JOURNAL_SLICE}.
 *
 * La tranche est posée ICI, jamais reçue : la query n'a aucun champ qui la
 * désigne, et ses filtres s'y ajoutent par `AND`. Le filtre par acteur s'élargit
 * aux références de la personne, comme sur le journal — sans quoi l'histoire
 * d'un comptable se couperait entre son `sub` et sa fiche.
 */
@QueryHandler(ReadTaxActivityJournalQuery)
export class ReadTaxActivityJournalHandler implements IQueryHandler<
  ReadTaxActivityJournalQuery,
  ActivityPageView
> {
  constructor(
    private readonly journal: ActivityJournalReader,
    private readonly authors: StaffAuthorReferences,
  ) {}

  async execute(query: ReadTaxActivityJournalQuery): Promise<ActivityPageView> {
    const { actorId } = query.filters;
    const actorIds = actorId === undefined ? null : await this.authors.referencesOf(actorId);
    return this.journal.page(query.filters, actorIds, TAX_JOURNAL_SLICE);
  }
}

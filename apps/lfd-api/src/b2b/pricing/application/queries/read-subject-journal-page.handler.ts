import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingJournalPageView } from "@lfd/contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { PricingJournalReader } from "../../domain/ports/pricing-journal.reader.js";
import { journalView } from "../journal-view.js";
import { ReadSubjectJournalPageQuery } from "./read-subject-journal-page.query.js";

/**
 * Une page du journal d'un sujet, ses auteurs nommés.
 *
 * Le même mapper que les deux autres lectures : c'est le même fil à l'écran,
 * seule sa découpe change.
 */
@QueryHandler(ReadSubjectJournalPageQuery)
export class ReadSubjectJournalPageHandler implements IQueryHandler<
  ReadSubjectJournalPageQuery,
  PricingJournalPageView
> {
  constructor(
    private readonly journal: PricingJournalReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ReadSubjectJournalPageQuery): Promise<PricingJournalPageView> {
    const { entries, total, asOf } = await this.journal.pageForSubject({
      subjectType: query.subjectType,
      subjectId: query.subjectId,
      page: query.page,
      pageSize: query.pageSize,
      asOf: query.asOf,
    });
    const authors = await this.staffAuthors.identify(entries.map((entry) => entry.actor));
    return {
      entries: entries.map((entry) => journalView(entry, authors)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      asOf,
    };
  }
}

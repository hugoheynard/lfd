import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingJournalEntryView } from "@lfd/contracts";

import { StaffAuthorDirectory } from "../../../../staff/directory/domain/staff-author-directory.js";
import { PricingJournalReader } from "../../domain/ports/pricing-journal.reader.js";
import { journalView } from "../journal-view.js";
import { ReadSubjectJournalQuery } from "./read-subject-journal.query.js";

@QueryHandler(ReadSubjectJournalQuery)
export class ReadSubjectJournalHandler implements IQueryHandler<
  ReadSubjectJournalQuery,
  PricingJournalEntryView[]
> {
  constructor(
    private readonly journal: PricingJournalReader,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {}

  async execute(query: ReadSubjectJournalQuery): Promise<PricingJournalEntryView[]> {
    const entries = await this.journal.forSubject(query.subjectType, query.subjectId);
    const authors = await this.staffAuthors.identify(entries.map((entry) => entry.actor));
    return entries.map((entry) => journalView(entry, authors));
  }
}

import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingJournalEntryView } from "@lfd/contracts";

import { PricingJournalReader } from "../../domain/ports/pricing-journal.reader.js";
import { journalView } from "../journal-view.js";
import { ReadSubjectJournalQuery } from "./read-subject-journal.query.js";

@QueryHandler(ReadSubjectJournalQuery)
export class ReadSubjectJournalHandler implements IQueryHandler<
  ReadSubjectJournalQuery,
  PricingJournalEntryView[]
> {
  constructor(private readonly journal: PricingJournalReader) {}

  async execute(query: ReadSubjectJournalQuery): Promise<PricingJournalEntryView[]> {
    const entries = await this.journal.forSubject(query.subjectType, query.subjectId);
    return entries.map(journalView);
  }
}

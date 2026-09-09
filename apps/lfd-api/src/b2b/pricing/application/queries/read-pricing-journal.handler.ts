import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { PricingJournalEntryView } from "@lfd/contracts";

import { PricingJournalReader } from "../../domain/ports/pricing-journal.reader.js";
import { journalView } from "../journal-view.js";
import { ReadPricingJournalQuery } from "./read-pricing-journal.query.js";

/** Au-delà, ce n'est plus une histoire, c'est un fichier de logs. */
const RECENT_ENTRIES = 50;

@QueryHandler(ReadPricingJournalQuery)
export class ReadPricingJournalHandler implements IQueryHandler<
  ReadPricingJournalQuery,
  PricingJournalEntryView[]
> {
  constructor(private readonly journal: PricingJournalReader) {}

  async execute(): Promise<PricingJournalEntryView[]> {
    const entries = await this.journal.recent(RECENT_ENTRIES);
    return entries.map(journalView);
  }
}

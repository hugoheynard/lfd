import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import type { ActivityPageView } from "@lfd/contracts";

import { ActivityJournalReader } from "../../domain/ports/activity-journal.reader.js";
import { ReadActivityJournalQuery } from "./read-activity-journal.query.js";

/**
 * Lecture du journal. Aucun travail propre : le filtre et la pagination
 * appartiennent à la base, et rien ne se compose ici — le handler existe pour
 * que le contrôleur dispatche sur le bus comme partout ailleurs.
 */
@QueryHandler(ReadActivityJournalQuery)
export class ReadActivityJournalHandler implements IQueryHandler<
  ReadActivityJournalQuery,
  ActivityPageView
> {
  constructor(private readonly journal: ActivityJournalReader) {}

  execute(query: ReadActivityJournalQuery): Promise<ActivityPageView> {
    return this.journal.page(query.filters);
  }
}

import type { ActivityQuery } from "@lfd/contracts";

/** Query : une page du journal d'activité, filtrée. */
export class ReadActivityJournalQuery {
  constructor(readonly filters: ActivityQuery) {}
}

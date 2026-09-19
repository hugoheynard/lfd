import type { TaxActivityQuery } from "@lfd/contracts";

/**
 * Query : une page de la **tranche fiscale** du journal — les faits qui
 * touchent à un taux de TVA (`TAX_JOURNAL_SLICE`), et eux seuls.
 */
export class ReadTaxActivityJournalQuery {
  constructor(readonly filters: TaxActivityQuery) {}
}

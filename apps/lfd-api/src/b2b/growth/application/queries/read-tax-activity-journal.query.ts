import type { TaxActivityQuery } from "@lfd/contracts";

/**
 * Query : une page de la **tranche fiscale** du journal — les faits de TVA et
 * de règles comptables, et eux seuls.
 */
export class ReadTaxActivityJournalQuery {
  constructor(readonly filters: TaxActivityQuery) {}
}

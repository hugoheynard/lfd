import type { StaffSuggestionSiteChoice } from "@lfd/contracts";

/**
 * Port de **lecture** : parmi ces points de retrait, lesquels sont OUVERTS —
 * non archivés et qui remettent des commandes ? Ce que juge la condition
 * « points de retrait » d'une règle (RS8), à l'écriture et dans les alertes.
 */
export abstract class SuggestionSiteReader {
  abstract openAmong(ids: readonly string[]): Promise<ReadonlySet<string>>;
}

/**
 * Port de **lecture** de ce que l'éditeur propose : les points de retrait
 * ouverts, nommés. Distinct de la vérification (ISP), comme
 * `SuggestionChoicesReader` l'est du catalogue.
 */
export abstract class SuggestionSiteChoicesReader {
  abstract openSites(): Promise<readonly StaffSuggestionSiteChoice[]>;
}

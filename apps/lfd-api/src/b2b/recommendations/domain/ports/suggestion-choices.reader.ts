import type { StaffSuggestionChoicesView } from "@lfd/contracts";

/**
 * Port de **lecture** de ce que l'éditeur propose : les articles servis à un
 * pro ou à un particulier, et leurs familles. Distinct des vérifications
 * (ISP) : refuser une saisie n'a pas à lister le catalogue.
 */
export abstract class SuggestionChoicesReader {
  abstract choices(): Promise<StaffSuggestionChoicesView>;
}

import type { ActivityQuery, ActivityPageView } from "@lfd/contracts";

/**
 * Port de **lecture** du journal. Distinct de `ActivityRecorder` (l'écriture) :
 * ce sont deux surfaces sans rapport, et un écran qui lit n'a aucune raison de
 * pouvoir écrire — la table est append-only, alimentée par les handlers.
 */
export abstract class ActivityJournalReader {
  abstract page(query: ActivityQuery): Promise<ActivityPageView>;
}

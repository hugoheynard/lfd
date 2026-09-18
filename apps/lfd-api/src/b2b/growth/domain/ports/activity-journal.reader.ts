import type { ActivityQuery, ActivityPageView } from "@lfd/contracts";

/**
 * Port de **lecture** du journal. Distinct de `ActivityRecorder` (l'écriture) :
 * ce sont deux surfaces sans rapport, et un écran qui lit n'a aucune raison de
 * pouvoir écrire — la table est append-only, alimentée par les handlers.
 */
export abstract class ActivityJournalReader {
  /**
   * Une page du journal. `actorIds` élargit le filtre `query.actorId` à toutes
   * les références de la même personne (id de fiche, `sub` actuel et anciens) ;
   * `null` = filtre par égalité stricte.
   */
  abstract page(
    query: ActivityQuery,
    actorIds: readonly string[] | null,
  ): Promise<ActivityPageView>;
}

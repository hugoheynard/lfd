/**
 * **Combien de taux sont réglés sur chaque contexte**, famille ou fiche — ce
 * que la liste lit pour dire ce qui retient un contexte avant le geste.
 *
 * Déclaré ici et implémenté par la racine : les taux réglés appartiennent au
 * catalogue, qu'un référentiel de base ne lit pas. Un port à part de
 * `SalesContextUsageReader` (ISP) : l'archive ne compte qu'un contexte, la
 * liste les compte tous en une lecture.
 */
export abstract class SalesContextRatingsReader {
  /** Identifiant de contexte → taux réglés ; un contexte que rien ne retient est absent. */
  abstract ratedByContext(): Promise<ReadonlyMap<string, number>>;
}

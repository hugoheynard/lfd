/**
 * **Réveiller le calcul routier avant qu'on en ait besoin** (2026-11-01,
 * décision de Hugo) : à l'ouverture du Tour manager, l'instance endormie
 * commence à charger sa carte pendant que l'équipe lit l'écran, au lieu de le
 * faire au premier « Proposer ».
 *
 * Ne lève JAMAIS : un réveil manqué n'empêche rien, « Proposer » attendra le
 * réveil lui-même (`OSRM_WAKE_BUDGET_MS`).
 */
export abstract class RoadRoutingWaker {
  /** Envoie un appel léger et attend sa réponse, ou l'épuisement du budget de réveil. */
  abstract wake(): Promise<void>;
}

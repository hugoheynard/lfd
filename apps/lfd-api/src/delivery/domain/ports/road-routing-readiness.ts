/**
 * **Le calcul routier est-il prêt à répondre ?** (décidé par Hugo le
 * 2026-11-24) : Tour manager voile ses tournées tant que l'instance endormie
 * charge sa carte, et pose la question toutes les quelques secondes.
 *
 * Port distinct de `RoadRoutingWaker` : sonder n'est pas réveiller, et
 * un lecteur de l'état ne dépend pas du geste de réveil.
 *
 * Ne lève JAMAIS : tout ce qui n'est pas une réponse franche vaut « pas prêt ».
 */
export abstract class RoadRoutingReadiness {
  /** Un seul essai court, sans attendre le réveil. */
  abstract isReady(): Promise<boolean>;
}

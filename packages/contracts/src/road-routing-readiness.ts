/**
 * **Le calcul routier est-il prêt ?** — `GET /admin/delivery/road-routing/readiness`.
 *
 * Tour manager voile ses tournées tant que la réponse est `false` (décidé par
 * Hugo le 2026-11-24) : le conteneur endormi met du temps à charger sa carte,
 * et un « Proposer » lancé pendant ce temps finissait en erreur.
 *
 * `true` aussi quand aucun calcul routier n'est configuré : il n'y a rien à
 * attendre.
 */
export interface RoadRoutingReadinessView {
  readonly ready: boolean;
}

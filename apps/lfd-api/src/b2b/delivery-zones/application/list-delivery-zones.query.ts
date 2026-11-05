import type { CustomerAudience } from "@lfd/contracts";

/**
 * Query : lister les zones de livraison avec le frais et le seuil de livraison
 * offerte RÉSOLUS pour une clientèle (sous-lot 0c). L'audience est DÉCLARÉE par
 * l'appelant, jamais lue sur un principal : la réponse reste la même pour
 * tous ceux qui la demandent, donc partageable par Workers Cache.
 */
export class ListDeliveryZonesQuery {
  constructor(readonly audience: CustomerAudience) {}
}

/** La fermeture d'un bac : l'instant et la fiche staff. */
export interface PackedOrderSeal {
  readonly at: Date;
  readonly by: string;
}

/**
 * **« Cette commande est-elle colisée ? »** — port étroit que le fournil
 * DÉCLARE et que le colisage IMPLÉMENTE (plan `colisage/plan-domaine-colisage.md`,
 * §17.2, K3a).
 *
 * La forme de `PackingStationReader` réduite au seul besoin des lecteurs qui
 * restent chez le fournil — l'état de la journée et le contrôle qualité : ils
 * ne lisent ni les lignes, ni les contenants, ni la réserve, seulement les bacs
 * fermés (ISP).
 *
 * Une commande rouverte au colisage (§17.2, option b) n'y figure pas : son
 * rangement est rouvert, même si le commerce la tient toujours « prête ».
 */
export abstract class PackedOrdersReader {
  /** Les bacs fermés de la journée, par identifiant opaque de commande. */
  abstract packedOn(serviceDay: string): Promise<ReadonlyMap<string, PackedOrderSeal>>;
}

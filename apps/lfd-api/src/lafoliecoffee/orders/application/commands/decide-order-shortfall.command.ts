import type { ShortfallRemainder } from "@lfd/contracts";

/**
 * **L'équipe décide du départ incomplet d'un envoi** (lot E6b,
 * plan E6 (`documentation/commandes/bon-de-livraison.md`) § 12.2 et § 13 ;
 * par envoi depuis le plan E7 reliquat, lot LB) — la commande au rang 1, un
 * reliquat au-delà.
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte. Aucune quantité : ce
 * qui part est ce que le colisage a figé au signal en vigueur.
 */
export class DecideOrderShortfallCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly remainder: ShortfallRemainder,
    readonly rank: number,
  ) {}
}

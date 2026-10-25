import type { ShortfallRemainder } from "@lfd/contracts";

/**
 * **L'équipe décide du départ incomplet d'une commande** (lot E6b,
 * `documentation/commandes/plan-e6-le-depart-incomplet.md` § 12.2 et § 13).
 *
 * `staffUserId` est l'id de la FICHE, reçu de la porte. Aucune quantité : ce
 * qui part est ce que le colisage a figé au signal en vigueur.
 */
export class DecideOrderShortfallCommand {
  constructor(
    readonly orderId: string,
    readonly staffUserId: string,
    readonly remainder: ShortfallRemainder,
  ) {}
}

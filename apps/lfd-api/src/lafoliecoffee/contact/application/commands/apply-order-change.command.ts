/**
 * **Appliquer une demande de modification** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)). Acte
 * **staff** : la révision est faite au nom de cette fiche. Rend la révision
 * produite. `expectedTotalCents` : le TTC du devis que l'équipe a vu (doc
 * `modifier-une-commande.md`, §2.3 (R14) — une délégation, le vu est celui de l'équipe).
 */
export class ApplyOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
    readonly expectedTotalCents: number,
  ) {}
}

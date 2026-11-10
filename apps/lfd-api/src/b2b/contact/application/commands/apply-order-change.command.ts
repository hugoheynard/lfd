/**
 * **Appliquer une demande de modification** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M4). Acte
 * **staff** : la révision est faite au nom de cette fiche. Rend la révision
 * produite. `expectedTotalCents` : le TTC du devis que l'équipe a vu (plan
 * `plan-s2-la-hausse.md`, R14 — une délégation, le vu est celui de l'équipe).
 */
export class ApplyOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
    readonly expectedTotalCents: number,
  ) {}
}

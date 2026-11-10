/**
 * **Refuser une demande de modification** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) avec un mot au
 * client. Acte **staff** : l'auteur est figé avec son nom.
 */
export class RefuseOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
    readonly reason: string,
  ) {}
}

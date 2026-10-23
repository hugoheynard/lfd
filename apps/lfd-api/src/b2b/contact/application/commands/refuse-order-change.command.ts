/**
 * **Refuser une demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4) avec un mot au
 * client. Acte **staff** : l'auteur est figé avec son nom.
 */
export class RefuseOrderChangeCommand {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
    readonly reason: string,
  ) {}
}

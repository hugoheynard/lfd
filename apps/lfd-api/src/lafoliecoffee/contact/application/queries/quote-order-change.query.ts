/**
 * **Ce que la modification demandée donnerait** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.5 « La demande après l'heure limite » (M4)) — le devis de
 * révision de l'équipe sur la commande telle qu'elle est, pour une demande
 * EN ATTENTE. Lu sous le droit de la boîte des demandes.
 */
export class QuoteOrderChangeQuery {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
  ) {}
}

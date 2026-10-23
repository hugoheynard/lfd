/**
 * **Ce que la modification demandée donnerait** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4) — le devis de
 * révision de l'équipe sur la commande telle qu'elle est, pour une demande
 * EN ATTENTE. Lu sous le droit de la boîte des demandes.
 */
export class QuoteOrderChangeQuery {
  constructor(
    readonly requestId: string,
    readonly staffUserId: string,
  ) {}
}

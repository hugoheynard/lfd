import type { OrderContent } from "../services/order-content.js";

/**
 * **Ce que la demande de modification coûterait** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, §14, décision de
 * Hugo du 2026-10-23) — un devis INDICATIF pour le client dont l'heure limite
 * est passée. Ne mute rien.
 */
export class QuoteOrderChangeRequestQuery {
  constructor(
    readonly orderId: string,
    readonly actorUserId: string,
    readonly content: OrderContent,
  ) {}
}

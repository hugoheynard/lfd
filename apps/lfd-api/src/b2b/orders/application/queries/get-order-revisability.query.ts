import type { RevisionPurpose } from "../../domain/services/order-revisability.js";

/**
 * **La commande se modifie-t-elle, pour ce client, maintenant ?** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, §6) — avec sa
 * révision courante. Le mur est celui de `GET /orders/:id` : hors mur, `404`.
 *
 * `purpose` (plan `plan-s2-la-hausse.md`, R2 ter) : `revise` pour la
 * boutique, `request` pour le dépôt d'une demande M4, qui garde
 * `card_settled` sur toute carte (R4).
 */
export class GetOrderRevisabilityQuery {
  constructor(
    readonly actorUserId: string,
    readonly orderId: string,
    readonly purpose: RevisionPurpose,
  ) {}
}

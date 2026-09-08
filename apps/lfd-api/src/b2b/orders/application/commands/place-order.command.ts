import type { OrderPaymentIntent, PlaceOrderPayload } from "@lfd/contracts";

/**
 * Passe une commande pour le client `actorUserId`.
 *
 * 🔴 **La société est un PARAMÈTRE, plus un champ du payload.** Elle est résolue
 * au serveur — par le guard, depuis les rattachements — et le contrôleur la
 * transmet ici. Un client ne peut donc plus en nommer une autre : le mur devient
 * inexprimable au lieu d'être vérifié à chaque lecture.
 *
 * Elle reste un paramètre explicite plutôt qu'une lecture du contexte dans le
 * handler : c'est ce qui permet au semis et aux tests de commander pour une
 * société sans monter de requête HTTP, et ce qui garde le handler pur de tout
 * ambiant.
 *
 * `null` = commande personnelle. Le mur (membre) ne s'applique que si une
 * entreprise est visée ; sinon, seul l'acteur connecté possède la commande.
 */
export class PlaceOrderCommand {
  constructor(
    readonly actorUserId: string,
    readonly payload: PlaceOrderPayload,
    readonly companyId: string | null,
  ) {}
}

/**
 * Résultat de la passation : la commande créée, plus — quand une **carte** est
 * requise (pas d'entreprise, ou entreprise non active / `per_order`) et un total
 * > 0 — l'intention de paiement à régler. `payment` absent = facturé sur terme
 * différé (entreprise active), rien à encaisser au checkout.
 */
export interface PlaceOrderResult {
  readonly id: string;
  readonly orderNumber: string;
  readonly payment?: OrderPaymentIntent;
}

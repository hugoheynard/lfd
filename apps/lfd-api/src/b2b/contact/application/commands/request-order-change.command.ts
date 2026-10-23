import type { OrderChangeRequestPayload } from "@lfd/contracts";

/**
 * **Demander une modification de commande** après l'heure limite (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4). Rend l'id de
 * la demande. La société qui fait foi est celle de la COMMANDE, lue par le
 * mur ; l'auteur vient du `Principal`, jamais du corps.
 */
export class RequestOrderChangeCommand {
  constructor(
    readonly orderId: string,
    readonly payload: OrderChangeRequestPayload,
    readonly actor: { readonly userId: string },
  ) {}
}

import type { OrderProblemPayload } from "@lfd/contracts";

/**
 * Signaler un problème sur une commande retirée ou livrée. Rend l'id de la
 * demande. `photos` sont les octets bruts des fichiers joints, dans l'ordre :
 * le domaine les valide.
 *
 * Aucune société reçue : celle qui fait foi est celle de la COMMANDE, lue
 * par le mur (`plan-commandes-des-sites.md`, §7.3, 2026-10-21).
 */
export class ReportOrderProblemCommand {
  constructor(
    readonly orderId: string,
    readonly payload: OrderProblemPayload,
    readonly photos: readonly Buffer[],
    readonly actor: { readonly userId: string },
  ) {}
}

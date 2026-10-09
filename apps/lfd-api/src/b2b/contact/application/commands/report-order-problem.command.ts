import type { OrderProblemPayload } from "@lfd/contracts";

/**
 * Signaler un problème sur une commande retirée ou livrée. Rend l'id de la
 * demande. `photos` sont les octets bruts des fichiers joints, dans l'ordre :
 * le domaine les valide.
 */
export class ReportOrderProblemCommand {
  constructor(
    readonly orderId: string,
    readonly payload: OrderProblemPayload,
    readonly photos: readonly Buffer[],
    readonly actor: { readonly userId: string; readonly companyId: string | null },
  ) {}
}

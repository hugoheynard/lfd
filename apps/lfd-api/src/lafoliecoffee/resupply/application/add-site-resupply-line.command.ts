import type { ResupplyTarget } from "../domain/site-resupply.js";

/** Ajoute un article à la demande en cours d'une visée. Rend l'identifiant de la demande. */
export class AddSiteResupplyLineCommand {
  constructor(
    readonly siteId: string,
    readonly target: ResupplyTarget,
    readonly sku: string,
    readonly quantity: number,
    /** Qui ajoute : la clé d'intention ne se partage pas entre deux personnes. */
    readonly staffUserId: string,
    /**
     * La clé d'intention de l'écran (en-tête `Idempotency-Key`) : la même
     * requête renvoyée n'additionne pas deux fois.
     */
    readonly intentKey: string,
  ) {}
}

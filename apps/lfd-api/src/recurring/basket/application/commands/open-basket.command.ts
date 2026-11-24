import type { CreateSubscriptionPayload } from "@lfd/contracts";

/** Ce que l'ouverture rend, et que le rejeu relit : l'identifiant du panier. */
export interface OpenedBasket {
  readonly id: string;
}

/**
 * Ouvre un panier récurrent pour la personne connectée. `actorUserId` vient
 * du `Principal` (jamais du corps) : on n'ouvre de panier que pour soi.
 */
export class OpenBasketCommand {
  constructor(
    readonly actorUserId: string,
    readonly payload: CreateSubscriptionPayload,
    /** La société de l'espace (`@ActingCompany`, vérifiée contre les rattachements), `null` en perso. */
    readonly companyId: string | null,
    /** La clé d'intention de l'écran (`Idempotency-Key`) : un rejeu ne refait pas le geste. */
    readonly intentKey: string,
  ) {}
}

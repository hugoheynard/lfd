import type { CreateSubscriptionPayload } from "@lfd/contracts";

/**
 * Crée un panier récurrent pour la personne connectée. `actorUserId` vient du
 * `Principal` (jamais du corps) : on n'abonne que soi-même.
 */
export class CreateSubscriptionCommand {
  constructor(
    readonly actorUserId: string,
    readonly payload: CreateSubscriptionPayload,
    /**
     * La société de l'espace où le panier est créé (`@ActingCompany`, vérifiée
     * contre les rattachements), `null` en perso (N4e).
     */
    readonly companyId: string | null,
  ) {}
}

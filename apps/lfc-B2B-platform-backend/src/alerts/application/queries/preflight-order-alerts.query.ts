import type { OrderPreflightPayload } from "@lfd/contracts";

/**
 * Le **contrôle de panier** : ce qu'on dirait au client s'il commandait ça.
 *
 * Une **query**, et c'est intentionnel : elle ne persiste rien, n'inscrit aucune
 * alerte au journal et ne réveille personne. Le même panier contrôlé dix fois
 * pendant que le client ajuste ses quantités ne laisse aucune trace.
 */
export class PreflightOrderAlertsQuery {
  constructor(
    /** Le demandeur — le mur, pas une information d'affichage. */
    readonly actorUserId: string,
    readonly payload: OrderPreflightPayload,
  ) {}
}

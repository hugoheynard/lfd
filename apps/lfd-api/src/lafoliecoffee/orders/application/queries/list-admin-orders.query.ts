import type { AdminOrdersQuery } from "@lfd/contracts";

/**
 * Liste les commandes pour le **staff**. Aucun acteur ici : contrairement aux
 * requêtes client, il n'y a pas de mur à appliquer — la porte est le guard
 * staff du contrôleur. Le jour où le staff sera lui-même cloisonné (cf. la
 * décision ouverte sur `StaffScope`), c'est CETTE requête qui portera le mur.
 */
export class ListAdminOrdersQuery {
  constructor(
    readonly filters: AdminOrdersQuery,
    /**
     * L'appelant tient `b2b_order_review:read`, lu dans les permissions que
     * la porte staff a résolues en base : sans lui, la vue `to_review` est
     * refusée.
     */
    readonly mayReadReviews: boolean,
  ) {}
}

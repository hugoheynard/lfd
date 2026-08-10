import type { AdminOrderRow, AdminOrdersQuery, OrderView } from "@lfd/contracts";

/**
 * Une commande **avec de quoi la murer** : la vue, plus les deux colonnes qui
 * disent à qui elle appartient. Elles ne sont PAS dans `OrderView` — celle-ci
 * part au client, et son propriétaire n'est jamais une information qu'il lui
 * faut : il ne lit que ce qui est déjà à lui.
 */
export interface OwnedOrder {
  readonly view: OrderView;
  /** Entreprise cliente, ou `null` = commande personnelle (zéro friction). */
  readonly companyId: string | null;
  /** Le client qui l'a passée — le mur des commandes personnelles. */
  readonly placedByUserId: string;
}

/**
 * Port de **lecture** des commandes. Vue dénormalisée (montants en centimes,
 * lignes snapshotées), la plus récente en tête. Les murs de tenancy sont
 * appliqués par les handlers, jamais ici.
 */
export abstract class OrderReader {
  abstract listByCompany(companyId: string): Promise<readonly OrderView[]>;

  /**
   * Les commandes **personnelles** d'un client (sans entreprise), la plus récente
   * en tête. Mur = le seul `placedByUserId` (pas d'entreprise à vérifier).
   */
  abstract listPersonal(userId: string): Promise<readonly OrderView[]>;

  /**
   * Une commande par identifiant, **avec son propriétaire** — sans le moindre
   * mur : c'est l'appelant qui décide s'il a le droit de la rendre. Rend `null`
   * si elle n'existe pas.
   */
  abstract findById(orderId: string): Promise<OwnedOrder | null>;

  /**
   * Les commandes vues du **staff**, la plus récente en tête : toutes celles que
   * les filtres laissent passer, entreprises **et** personnelles. Aucun mur ici —
   * c'est la porte staff du contrôleur qui décide, et un commercial qui ne
   * verrait que les commandes d'entreprise raterait tout le zéro friction.
   */
  abstract listForAdmin(query: AdminOrdersQuery): Promise<readonly AdminOrderRow[]>;
}

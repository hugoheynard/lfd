import type {
  AdminOrderRow,
  AdminOrdersQuery,
  FulfillmentMethod,
  OrderHandoverLine,
  OrderStatus,
  OrderView,
} from "@lfd/contracts";

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

  /**
   * La commande derrière un **jeton de remise**, ou `null` si le jeton n'est
   * attribué à aucune. Aucune règle appliquée ici : le port rend l'état, c'est
   * `handoverBlocker` qui dit si la remise est possible — une seule voix pour
   * une seule règle.
   */
  abstract findByHandoverToken(token: string): Promise<HandoverOrder | null>;
}

/**
 * Ce qu'il faut savoir d'une commande **au comptoir** : de quoi la nommer, de
 * quoi la recompter, et de quoi juger si on peut la remettre.
 *
 * Aucun montant — celui qui remet un colis coche des articles ; faire apparaître
 * un prix négocié devant la personne qui attend n'aide personne. Même raison que
 * sur le bon de livraison.
 */
export interface HandoverOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** La raison sociale, ou la personne quand la commande est sans entreprise. */
  readonly customerLabel: string;
  readonly placedAt: Date;
  readonly requestedDeliveryDate: Date | null;
  /** Nom du point de retrait figé à la commande, ou `null` s'il n'en portait pas. */
  readonly pickupLabel: string | null;
  readonly status: OrderStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly handedOverAt: Date | null;
  readonly handedOverBy: string | null;
  readonly lines: readonly OrderHandoverLine[];
}

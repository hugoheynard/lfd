import type {
  AdminOrderRow,
  AdminOrdersQuery,
  FulfillmentMethod,
  OrderHandoverLine,
  OrderStatus,
  OrderView,
  AtelierSheet,
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
  /**
   * L'intention Stripe rattachée, ou `null`. Hors `OrderView` pour la même
   * raison que le propriétaire : le client n'a pas à la lire dans sa commande,
   * il la reçoit quand il demande explicitement à régler.
   */
  readonly stripePaymentIntentId: string | null;
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
   * La commande derrière un **numéro** — ce que le QR de la fiche d'atelier
   * encode.
   *
   * Lecture par la référence et non par un secret, et c'est délibéré : le
   * colisage est un fait INTERNE, sans seconde partie à représenter. Ce qui le
   * protège est la porte staff, pas l'ignorance du code — lequel est de toute
   * façon imprimé en clair sur la même feuille.
   */
  /**
   * **Qui a passé cette commande**, par son numéro — trois champs, pas un de
   * plus.
   *
   * 🔴 Le seul appelant est `MarkOrderFulfilledHandler`, qui réagit à la remise
   * pour publier le fait. Il appelait `findHandoverByReference`, c'est-à-dire la
   * lecture COMPLÈTE que la remise fait pour peindre son écran — lignes
   * comprises — alors qu'il n'a besoin que d'un identifiant, d'un numéro et
   * d'un destinataire.
   *
   * ⚠️ C'est ce qui m'avait fait croire que ce verbe n'avait aucun appelant
   * dans le commerce (2026-09-11). Il en avait un, et il lisait trop.
   */
  abstract findAuthorByReference(reference: string): Promise<OrderAuthor | null>;

  abstract findForPacking(reference: string): Promise<PackingOrder | null>;

  /**
   * Les **fiches de fonction** d'une journée de service : les commandes dont la
   * date de retrait/livraison est celle-là, avec leurs lignes, ordonnées par
   * référence.
   *
   * Ordre par **référence** et non par date de commande : une pile de papier se
   * réimprime, et deux tirages doivent rendre exactement la même pile — sinon la
   * numérotation « fiche 3/14 » cesse de désigner la même feuille.
   *
   * Seules les **annulées** sont écartées. Une commande déjà remise reste dans
   * son lot : la retirer ferait maigrir la pile entre deux tirages, et c'est
   * précisément le compte qui sert de preuve qu'il ne manque rien.
   */
  abstract listForProduction(date: string): Promise<readonly AtelierSheet[]>;
}

/**
 * Ce qu'il faut savoir d'une commande **au comptoir** : de quoi la nommer, de
 * quoi la recompter, et de quoi juger si on peut la remettre.
 *
 * Aucun montant — celui qui remet un colis coche des articles ; faire apparaître
 * un prix négocié devant la personne qui attend n'aide personne. Même raison que
 * sur le bon de livraison.
 */
/** L'état d'une commande, réduit à ce que le fournil regarde en scannant. */
export interface PackingOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** Le client à qui elle appartient — le sujet de la trace de colisage. */
  readonly placedByUserId: string;
  readonly customerLabel: string;
  readonly requestedDeliveryDate: Date | null;
  readonly status: OrderStatus;
  readonly readyAt: Date | null;
  readonly readyBy: string | null;
  readonly lines: readonly OrderHandoverLine[];
}

/**
 * ⚠️ **Aucun champ de remise ici depuis le 2026-09-07.** `handedOverAt`,
 * `handedOverBy` et `handedOverVia` en faisaient partie tant que le commerce
 * détenait ce fait ; c'est le fournil qui le détient maintenant, et les colonnes
 * qui restent sur `orders` sont un **snapshot** qu'il lui annonce. Les rendre
 * ici ferait de la copie la source.
 */
/**
 * Une ligne de la file du comptoir. **Aucun montant** : on ne facture pas à la
 * remise, et un total affiché là se lirait comme une somme à encaisser.
 *
 * Elle ne porte pas non plus les LIGNES de la commande : la file en affiche des
 * dizaines, et charger le détail de chacune pour n'en ouvrir qu'une est le
 * gaspillage que `HandoverSubjectReader` évite déjà, commande par commande.
 */
export interface HandoverQueueOrder {
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /**
   * L'**enseigne** — le nom peint sur la devanture —, ou `null` quand elle ne
   * dirait rien de plus que la raison sociale.
   *
   * 🔴 `null` et non la chaîne vide, et `null` AUSSI quand les deux noms sont
   * identiques : la colonne vaut `""` par défaut sur toute société qui n'en a
   * pas déclaré, et une maison qui a rempli les deux champs à l'identique n'a
   * pas voulu voir son nom deux fois. Le choix est fait ICI, une seule fois —
   * laissé à l'écran, chaque écran le referait, et un seul l'oublierait.
   */
  readonly tradeName: string | null;
  readonly pickupLabel: string | null;
  readonly fulfillmentMethod: "pickup" | "delivery";
  /** Le créneau convenu AVEC sa provenance — cf. `HandoverQueueWindow`. */
  readonly window: HandoverQueueWindow | null;
  /** Somme des quantités, calculée en base : on ne rapatrie pas les lignes. */
  readonly totalUnits: number;
  readonly status: string;
  readonly readyAt: Date | null;
  readonly placedAt: Date;
}

/**
 * 🔴 **La provenance n'est pas un détail** — mais pas pour la raison qui était
 * écrite ici jusqu'au 2026-09-11.
 *
 * `source: "override"` veut dire que quelqu'un a **demandé** cette tranche ;
 * `"default"` qu'elle vient d'un réglage, donc d'une disponibilité et non d'une
 * promesse. Juger un retard sur la seconde reprocherait à un client une heure
 * qu'il n'a jamais donnée.
 *
 * ⚠️ **Au comptoir, aujourd'hui, elle vaut TOUJOURS `"override"`** (vérifié le
 * 2026-09-11). Un retrait ne prend aucun défaut — `OrderDraftingService.
 * defaultsFor` le refuse explicitement, parce que les heures d'un point sont
 * une contrainte d'ouverture partagée et non la préférence d'un client —, donc
 * une fenêtre qui existe sur un retrait a forcément été demandée. Les seules
 * fenêtres `"default"` non nulles viennent du carnet d'une LIVRAISON, et la
 * file du comptoir les écarte (`atTheCounter`).
 *
 * La garde côté écran reste juste et se garde : elle redeviendra vivante le
 * jour où la saisie staff gagnera un créneau, ou où les livraisons auront leur
 * file. Ce qui est retiré est sa justification, qui était **fausse** : elle
 * disait que le backfill du 2026-08-15 avait posé une heure sur toutes les
 * commandes antérieures. Il a posé l'inverse, et l'écrit dans son propre
 * en-tête — « l'heure convenue reste `null` […] en inventer une ferait
 * promettre un créneau que personne n'a arrêté ». Une provenance sans heure
 * n'est pas un créneau : `windowOf` la rend `null`.
 */
export interface HandoverQueueWindow {
  /** `null` = aucune borne basse, c'est-à-dire « avant `end` ». */
  readonly start: string | null;
  readonly end: string;
  readonly source: "default" | "override";
}

/** Qui a passé une commande — ce que la publication d'un fait a besoin de citer. */
export interface OrderAuthor {
  readonly orderId: string;
  readonly orderNumber: string;
  /** Le client à qui elle appartient — le sujet du fait publié. */
  readonly placedByUserId: string;
}

export interface HandoverOrder {
  readonly orderId: string;
  readonly orderNumber: string;
  /** Le client à qui elle appartient — le sujet de la trace de remise. */
  readonly placedByUserId: string;
  /** La raison sociale, ou la personne quand la commande est sans entreprise. */
  readonly customerLabel: string;
  readonly placedAt: Date;
  readonly requestedDeliveryDate: Date | null;
  /** Nom du point de retrait figé à la commande, ou `null` s'il n'en portait pas. */
  readonly pickupLabel: string | null;
  readonly status: OrderStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** La note du client — elle est sur le bon qu'on coche au comptoir. */
  readonly note: string;
  readonly lines: readonly OrderHandoverLine[];
}

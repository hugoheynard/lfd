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
   * La commande derrière un **jeton de remise**, ou `null` si le jeton n'est
   * attribué à aucune. Aucune règle appliquée ici : le port rend l'état, c'est
   * `handoverBlocker` qui dit si la remise est possible — une seule voix pour
   * une seule règle.
   */
  abstract findByHandoverToken(token: string): Promise<HandoverOrder | null>;

  /**
   * La même commande, trouvée par son **numéro** — le chemin de la remise
   * saisie, quand le code n'est pas présentable.
   *
   * Le numéro n'est pas un secret : il est imprimé sur le bon. Ce qui protège
   * cette porte est la session staff, comme le colisage — et c'est suffisant,
   * parce que saisir une remise est un acte dont l'auteur est enregistré.
   */
  abstract findHandoverByReference(reference: string): Promise<HandoverOrder | null>;

  /**
   * **Ce que le comptoir attend un jour donné** — la file, avant tout scan.
   *
   * Voisine de `listForProduction`, et volontairement DISTINCTE : le fournil
   * veut ce qu'il doit fabriquer, le comptoir veut ce qu'il doit rendre. Les
   * deux lisent la même journée et ne portent pas les mêmes champs — l'un a
   * besoin des lignes et des allergènes, l'autre du créneau et du total en
   * pièces. Les fondre ferait grossir l'une pour servir l'autre.
   *
   * ⚠️ Elle rend AUSSI les commandes annulées : c'est la remise qui décide quoi
   * en faire (`handoverBlocker`), et une file qui les cacherait laisserait un
   * client se présenter sans que l'écran sache dire pourquoi on refuse.
   *
   * @param day `AAAA-MM-JJ` — la colonne est un `@db.Date`, sans heure.
   */
  abstract expectedForHandoverOn(day: string): Promise<readonly HandoverQueueOrder[]>;

  /**
   * La commande derrière un **numéro** — ce que le QR de la fiche d'atelier
   * encode.
   *
   * Lecture par la référence et non par un secret, et c'est délibéré : le
   * colisage est un fait INTERNE, sans seconde partie à représenter. Ce qui le
   * protège est la porte staff, pas l'ignorance du code — lequel est de toute
   * façon imprimé en clair sur la même feuille.
   */
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
 * 🔴 **La provenance n'est pas un détail.** `source: "default"` veut dire que
 * l'heure vient du réglage du point, recopiée à la commande — une heure
 * d'OUVERTURE, pas une promesse. Le backfill du 2026-08-15 en a posé une sur
 * l'intégralité des commandes antérieures : calculer un retard dessus
 * déclencherait une alarme sur tout le portefeuille d'un coup.
 */
export interface HandoverQueueWindow {
  /** `null` = aucune borne basse, c'est-à-dire « avant `end` ». */
  readonly start: string | null;
  readonly end: string;
  readonly source: "default" | "override";
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
  readonly lines: readonly OrderHandoverLine[];
}

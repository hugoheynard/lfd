/**
 * **Le colisage proposé d'une commande livrée**, et les moitiés de bac libres
 * autour d'elle (`documentation/livraisons/plan-preparation-de-tournee.md`,
 * lot 4 bis, L4b-C4, v2-3 et v2-4, tranche C).
 *
 * Une PROPOSITION, jamais imposée : le poste de colisage la montre (« 2 Bac M
 * + ½ Bac S »), puis le fournil **déclare ce qu'il a réellement fait**
 * (`POST colisage/bacs`, `POST colisage/bacs/partage`) — c'est la déclaration
 * qui fait foi. Lire une proposition n'écrit rien.
 *
 * Routes (`admin/livraison/…`, sous `delivery_loading`) :
 *
 * - `GET colisage/proposition?commande=` → {@link DeliveryPackingProposalView} ;
 * - `GET colisage/bacs/partenaires?commande=` → {@link DeliveryBinFreeHalvesView}.
 *
 * Une commande inconnue, annulée ou passée en retrait est refusée comme à la
 * déclaration (409 `delivery.bins_not_declarable`).
 *
 * ## La règle de place (v2-3)
 *
 * Une unité d'un produit occupe `1 / contenance(type, produit)` d'un bac
 * ENTIER ; un demi-bac offre 0,5. Les produits d'une commande se mélangent
 * dans un bac en additionnant leurs places (Q3). Un produit qui demande le
 * froid ne va que dans un type isotherme, et jamais dans le même bac qu'un
 * produit sec ; un produit sec va dans un type non isotherme, et en isotherme
 * seulement si aucun autre type ne le contient.
 */

/** Une ligne de la commande, fusionnée par SKU, telle que le colisage la lit. */
export interface DeliveryPackingLineView {
  readonly sku: string;
  /** Le nom figé à la passation. */
  readonly name: string;
  readonly quantity: number;
  /** Le froid de la fiche produit (relayé par le catalogue B2B) ; `false` = rien de déclaré. */
  readonly requiresCold: boolean;
}

/**
 * Des bacs d'UN type proposés pour une commande — exactement la forme d'une
 * déclaration (`whole` entiers, et `half` pour une moitié en plus).
 */
export interface DeliveryPackingBinView {
  readonly binTypeId: string;
  readonly binTypeName: string;
  readonly isotherm: boolean;
  /** Le contenu demande le froid. Un bac ne mélange jamais froid et sec. */
  readonly cold: boolean;
  /** Bacs entiers, ≥ 0. */
  readonly whole: number;
  /** Une moitié de bac cloisonné en plus. */
  readonly half: boolean;
  /**
   * Remplissage du DERNIER bac de l'entrée (la moitié s'il y en a une), 0..1,
   * rapporté à ce qu'il offre : une moitié pleine vaut 1. Arrondi au centième.
   */
  readonly fill: number;
  /** Ce qui va dans ces bacs, par SKU, total de l'entrée. */
  readonly content: readonly { readonly sku: string; readonly quantity: number }[];
}

/**
 * Pourquoi une ligne n'est pas placée — jamais devinée :
 * - `no_capacity` : aucun type en service n'a de contenance pour ce produit ;
 * - `cold_without_isotherm` : le produit demande le froid, et aucun type
 *   isotherme en service n'a de contenance pour lui.
 */
export type DeliveryPackingUnplacedReason = "no_capacity" | "cold_without_isotherm";

/** Une ligne (ou ce qu'il en reste) que la proposition ne sait pas placer. */
export interface DeliveryPackingUnplacedView {
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
  readonly reason: DeliveryPackingUnplacedReason;
}

/**
 * **En dernier recours** (v2-4) : le dernier bac de `bins[replacesBinIndex]`
 * tiendrait dans la moitié libre d'un bac déjà déclaré pour l'arrêt voisin.
 * Pour le suivre : déclarer `bins[replacesBinIndex]` sans ce dernier bac (un
 * entier de moins, ou sans la moitié), puis partager `partnerBinId`.
 */
export interface DeliveryPackingShareCandidateView {
  readonly partnerOrderId: string;
  readonly partnerReference: string;
  /** La moitié déjà déclarée, à passer à `POST colisage/bacs/partage`. */
  readonly partnerBinId: string;
  /** Le type du bac partagé — celui de la moitié partenaire. */
  readonly binTypeId: string;
  readonly binTypeName: string;
  /** L'entrée de `bins` dont le dernier bac irait dans la moitié libre. */
  readonly replacesBinIndex: number;
}

/** **Le colisage proposé** d'une commande. */
export interface DeliveryPackingProposalView {
  readonly orderId: string;
  readonly reference: string;
  readonly lines: readonly DeliveryPackingLineView[];
  /** Froid d'abord, puis sec ; dans un groupe, par ordre d'apparition des types. */
  readonly bins: readonly DeliveryPackingBinView[];
  readonly unplaced: readonly DeliveryPackingUnplacedView[];
  /**
   * `null` sauf si la commande est dans une tournée NON partie, qu'un arrêt
   * CONSÉCUTIF porte une moitié libre d'un type compatible (isotherme pour
   * isotherme), et que le dernier bac d'une entrée tient dans 0,5 de ce type.
   */
  readonly shareCandidate: DeliveryPackingShareCandidateView | null;
}

/** Où est la commande : sa tournée vivante, et la position de son arrêt. */
export interface DeliveryOrderRoundPlaceView {
  readonly roundId: string;
  readonly day: string;
  readonly vehicleName: string;
  readonly passage: number;
  /** La position de l'arrêt dans l'ordre de passage (celle de l'écran de chargement). */
  readonly position: number;
  /** Partie le, ou `null`. Partie : plus aucun partage. */
  readonly departedAt: string | null;
}

/** Une moitié déclarée dont l'autre côté est libre, à un arrêt voisin. */
export interface DeliveryBinFreeHalfView {
  /** La moitié déclarée — le `partnerBinId` d'un partage. */
  readonly binId: string;
  readonly code: string;
  readonly orderId: string;
  readonly reference: string;
  readonly customerLabel: string;
  /** La position de SON arrêt. */
  readonly position: number;
  readonly binTypeId: string;
  readonly binTypeName: string;
  readonly isotherm: boolean;
  /** Le côté qu'un partage prendrait. */
  readonly freeHalf: "left" | "right";
}

/**
 * **Les moitiés libres autour d'une commande** : celles des arrêts
 * CONSÉCUTIFS de sa tournée vivante non partie, d'un type en service. Vide si
 * la commande n'est dans aucune tournée (`round: null`) ou si la tournée est
 * partie.
 */
export interface DeliveryBinFreeHalvesView {
  readonly orderId: string;
  readonly reference: string;
  readonly round: DeliveryOrderRoundPlaceView | null;
  /** Par position d'arrêt, puis par identifiant. */
  readonly halves: readonly DeliveryBinFreeHalfView[];
}

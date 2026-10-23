/**
 * Les textes des e-mails **de la commande elle-même** : la confirmation, la
 * mise à disposition, le départ en livraison, et l'alerte au propriétaire
 * d'une adresse. Section par clé du registre (`B2bMails`).
 */

/** Les trois régimes de règlement, tels que le client les lit. */
export interface OrderSettlementCopy {
  /** Déjà réglée par carte. */
  readonly paid: string;
  /** Enregistrée, mais il reste à payer. */
  readonly due: string;
  /** Portée au compte, rien à encaisser maintenant. */
  readonly account: string;
}

/** Ce que dit le courriel de confirmation d'une commande. */
export interface OrderPlacedCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  /** Sur-titre de l'en-tête, en capitales. */
  readonly kicker: string;
  /** Titre, selon ce que la commande doit encore. */
  readonly title: OrderSettlementCopy;
  readonly intro: string;
  /** Libellé de la ligne de total, selon le même régime. */
  readonly totalLabel: OrderSettlementCopy;
  readonly recapPickup: string;
  readonly recapDelivery: string;
  readonly recapContent: string;
  /** `{count}` = le nombre de pièces. */
  readonly recapPieces: string;
  readonly recapDiscount: string;
  /** La ligne du bon de fidélité, distincte de la remise (plan des points, C7). */
  readonly recapVoucher: string;
  readonly recapVat: string;
  /**
   * Le total d'un pro **au compte**, hors taxe (F5, plan
   * `bons-et-facture-concordants`) : la TVA se calcule une fois sur le mois,
   * et un TTC par bon contredirait la facture de quelques centimes.
   */
  readonly totalPretax: string;
  /** La ligne qui dit où sont la TVA et le TTC : libellé, puis valeur. */
  readonly recapTaxLater: string;
  readonly recapTaxLaterValue: string;
  /**
   * Le bloc du QR de retrait. Il est **dans le corps** et non en pièce jointe :
   * c'est la seule chose qu'on vient chercher debout devant un comptoir, et un
   * PDF à ouvrir sur un téléphone, la main sur la porte, ne se scanne pas.
   */
  readonly qrTitle: string;
  readonly qrLine: string;
  /** Le texte alternatif de l'image du QR. `{ref}` — lu quand les images sont bloquées. */
  readonly qrAlt: string;
  readonly cta: string;
  /** Ce que le client fait s'il veut changer quelque chose. */
  readonly changeNote: string;
  /** Lot C6 : le lien « gérer ou annuler ma commande » (invité : la page d'annulation). */
  readonly manageLink: string;
  readonly footer: string;
}

/**
 * Ce que dit le courriel de **mise à disposition** — celui qui part quand
 * l'atelier scanne le QR de colisage.
 *
 * Il répond à **une** question et pas deux : où et quand venir la chercher. Le
 * récapitulatif des montants était le travail de la confirmation ; le répéter
 * ici ferait relire un décompte à quelqu'un qui met son manteau.
 *
 * Deux titres et deux chapeaux, parce qu'un retrait et une livraison ne
 * demandent pas la même chose au client : l'un doit se déplacer, l'autre doit
 * être là.
 */
export interface OrderReadyCopy {
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly kicker: string;
  readonly titlePickup: string;
  readonly titleDelivery: string;
  readonly introPickup: string;
  readonly introDelivery: string;
  /** Le point de retrait, ou l'adresse servie. */
  readonly whereLabel: string;
  readonly contentLabel: string;
  /** `{count}` = le nombre de pièces. */
  readonly piecesLabel: string;
  /**
   * Le QR, **à nouveau**. Il était déjà dans la confirmation, et le répéter
   * n'est pas une redite : c'est MAINTENANT qu'on s'en sert, et personne ne
   * remonte un fil de courriels le téléphone à la main devant un comptoir.
   */
  readonly qrTitle: string;
  readonly qrLine: string;
  /** Le texte alternatif de l'image du QR. `{ref}` — lu quand les images sont bloquées. */
  readonly qrAlt: string;
  readonly cta: string;
  readonly footer: string;
}

/**
 * Ce que dit le courriel de **départ en livraison** — celui qui part quand la
 * tournée quitte le dépôt (`documentation/livraisons/livreur/en-route.md`, PL3-D4).
 *
 * 🔴 **Aucune heure.** On n'a pas d'estimation fiable par arrêt : une heure
 * fausse coûte plus qu'aucune heure. Ni nom ni téléphone du livreur.
 */
export interface DeliveryEnRouteCopy {
  readonly subject: string;
  readonly title: string;
  /** « Votre livreur est parti, il arrive dans la journée. » */
  readonly intro: string;
  readonly referenceLabel: string;
  readonly addressLabel: string;
  readonly cta: string;
  readonly footer: string;
}

/**
 * **« Une commande vient d'être passée avec votre adresse »** — au
 * propriétaire du compte, jamais à celui qui commande. Ni lien, ni détail de
 * la commande : le lecteur n'est pas forcément celui qui a commandé.
 */
export interface OrderPlacedWithYourEmailCopy {
  readonly subject: string;
  /** `{firstName}`. */
  readonly title: string;
  /** Le même, quand on ne connaît pas le prénom. */
  readonly titleWithoutName: string;
  readonly intro: string;
  /** « Si c'est vous, il n'y a rien à faire ». */
  readonly ifItIsYou: string;
  readonly footer: string;
}

/** La famille « commande », une section par clé du registre. */
export interface OrderMailsCopy {
  readonly "customer.order-placed": OrderPlacedCopy;
  readonly "customer.order-ready": OrderReadyCopy;
  readonly "customer.delivery-en-route": DeliveryEnRouteCopy;
  readonly "customer.order-placed-with-your-email": OrderPlacedWithYourEmailCopy;
}

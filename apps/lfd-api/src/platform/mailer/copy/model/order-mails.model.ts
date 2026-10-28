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
  /**
   * Titre — le même quel que soit le règlement (Hugo, 2026-10-28 : « moins
   * on en dit, mieux c'est ») ; le montant dit déjà ce qui reste dû.
   */
  readonly title: string;
  /**
   * La phrase d'ouverture. `{ref}` = le numéro, `{day}` = le jour de service
   * en toutes lettres, `{routing}` = l'acheminement (`routing*`).
   */
  readonly intro: string;
  /** La même, pour une commande sans jour de service. */
  readonly introWithoutDay: string;
  /** `{place}` = le point de retrait, sinon sa ville. */
  readonly routingPickup: string;
  readonly routingPickupWithoutPlace: string;
  /** `{city}` = la ville de livraison. */
  readonly routingDelivery: string;
  readonly routingDeliveryWithoutCity: string;
  /** Le créneau, accolé à l'acheminement. `{start}`, `{end}` en HH:mm. */
  readonly windowBetween: string;
  /** Le créneau sans borne basse. */
  readonly windowBefore: string;
  /** Libellé de la ligne de total, selon le même régime. */
  readonly totalLabel: OrderSettlementCopy;
  readonly recapPickup: string;
  readonly recapDelivery: string;
  readonly recapContent: string;
  /** `{count}` = le nombre de pièces. */
  readonly recapPieces: string;
  /**
   * Une ligne au poids dans le contenu (`plan-vente-au-poids.md`, P3) :
   * `{name}` = l'article, `{weight}` = « 500 g », « 1,25 kg ».
   */
  readonly recapWeighed: string;
  /**
   * La tête du libellé de la remise de retrait ; le point et la règle figés la
   * suivent (« Remise retrait Le Labo (5 %) »).
   */
  readonly recapDiscount: string;
  /** `{base}` = l'assiette HT, quand une ligne est exclue de la remise. */
  readonly recapDiscountBase: string;
  /** La ligne du bon de fidélité, distincte de la remise (plan des points, C7). */
  readonly recapVoucher: string;
  readonly recapVat: string;
  /** « dont TVA 5,5 % » — une ligne par taux d'une commande composée en TTC. */
  readonly recapVatRate: string;
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
  /**
   * Le libellé du bouton « Itinéraire » d'une commande EN RETRAIT (plan
   * `plan-textes-des-e-mails.md`, E4, S7). Le lien, lui, vient des données :
   * le point GPS du site, sinon son adresse figée dans la commande.
   */
  readonly itinerary: string;
  readonly cta: string;
  /** Lot C6 : le lien « gérer ou annuler ma commande » (invité : la page d'annulation). */
  readonly manageLink: string;
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
  /** Le même titre en retrait et en livraison (2026-10-28). */
  readonly title: string;
  readonly introPickup: string;
  readonly introDelivery: string;
  /** Le point de retrait, ou l'adresse servie. */
  readonly whereLabel: string;
  readonly contentLabel: string;
  /** `{count}` = le nombre de pièces. */
  readonly piecesLabel: string;
  /** Une ligne au poids : `{name}`, `{weight}` — cf. `recapWeighed`. */
  readonly weighedLabel: string;
  /**
   * Le QR, **à nouveau**. Il était déjà dans la confirmation, et le répéter
   * n'est pas une redite : c'est MAINTENANT qu'on s'en sert, et personne ne
   * remonte un fil de courriels le téléphone à la main devant un comptoir.
   */
  readonly qrTitle: string;
  readonly qrLine: string;
  /** Le texte alternatif de l'image du QR. `{ref}` — lu quand les images sont bloquées. */
  readonly qrAlt: string;
  /**
   * Le libellé du bouton « Itinéraire » d'une commande EN RETRAIT (plan
   * `plan-textes-des-e-mails.md`, E4, S7). Le lien, lui, vient des données :
   * le point GPS du site, sinon son adresse figée dans la commande.
   */
  readonly itinerary: string;
  readonly cta: string;
  /**
   * Le **rappel** au client qui n'est pas venu (« Rappel au client », depuis
   * la Supervision, Hugo 2026-10-25) : le même courriel, QR compris, mais il
   * ne dit plus « c'est prêt » — il dit « elle vous attend, à tel point ».
   * `{ref}` = le numéro de commande.
   */
  readonly subjectReminder: string;
  readonly kickerReminder: string;
  readonly titleReminder: string;
  /** `{site}` = le point de retrait figé à la commande. */
  readonly introReminder: string;
  /** Le même, pour une commande qui n'a pas figé le nom de son point. */
  readonly introReminderWithoutSite: string;
  /**
   * **Le reste de la commande** (plan E7 reliquat, choix 17) : le courriel
   * d'un envoi de rang > 1, qui ne dit plus « votre commande » mais « le
   * reste de votre commande » — le client a déjà reçu « prête » pour le
   * premier envoi. `{ref}` = le numéro de commande.
   */
  readonly subjectRemainder: string;
  readonly kickerRemainder: string;
  readonly titleRemainderPickup: string;
  readonly titleRemainderDelivery: string;
  readonly introRemainderPickup: string;
  readonly introRemainderDelivery: string;
}

/**
 * Ce que dit le courriel **« Votre commande prend du retard »** — le geste
 * « Avertir le client » de la Supervision (Hugo, 2026-10-25), quand la fin du
 * créneau de retrait est passée et que la commande n'est pas prête.
 *
 * 🔴 **Aucune heure.** On ne sait pas quand elle le sera : une heure inventée
 * coûte plus qu'aucune. Le client sera prévenu par le courriel « prête ».
 */
export interface OrderDelayedCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  /** Objet du message. `{ref}` = le numéro de commande. */
  readonly subject: string;
  readonly title: string;
  /** Ce qui se passe, et ce qui suit : le courriel « prête ». */
  readonly intro: string;
  readonly referenceLabel: string;
  readonly whereLabel: string;
  readonly apology: string;
  readonly cta: string;
}

/**
 * Ce que dit le courriel de **départ en livraison** — celui qui part quand la
 * tournée quitte le dépôt (`documentation/livraisons/livreur/en-route.md`, PL3-D4).
 *
 * 🔴 **Aucune heure estimée.** On n'a pas d'estimation fiable par arrêt : une
 * heure fausse coûte plus qu'aucune heure. Le seul horaire dit est le CRÉNEAU
 * choisi à la commande, quand elle en a un. Ni nom ni téléphone du livreur.
 */
export interface DeliveryEnRouteCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
  readonly subject: string;
  readonly title: string;
  /** « Votre livreur est parti. Il arrive bientôt. » */
  readonly intro: string;
  readonly referenceLabel: string;
  readonly addressLabel: string;
  /** Le créneau de la commande, à la suite de l'adresse. `{start}`, `{end}`. */
  readonly windowBetween: string;
  /** Le créneau « avant ». `{end}`. */
  readonly windowBefore: string;
  readonly cta: string;
  /** Le départ d'un envoi de rang > 1 — « le reste de votre commande » (plan E7 reliquat, choix 17). */
  readonly subjectRemainder: string;
  readonly titleRemainder: string;
  readonly introRemainder: string;
}

/**
 * **« Une commande vient d'être passée avec votre adresse »** — au
 * propriétaire du compte, jamais à celui qui commande. Ni lien, ni détail de
 * la commande : le lecteur n'est pas forcément celui qui a commandé.
 */
export interface OrderPlacedWithYourEmailCopy {
  /** Le sous-titre du bandeau d'en-tête, sous l'enseigne — rendu en capitales. */
  readonly kicker: string;
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
  readonly "customer.order-delayed": OrderDelayedCopy;
  readonly "customer.order-placed-with-your-email": OrderPlacedWithYourEmailCopy;
}

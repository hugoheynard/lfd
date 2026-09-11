/**
 * Contrat de fil de la **remise en main propre** — le retrait au labo.
 *
 * Le principe tient en une phrase : **le scan prouve la présence, la session
 * prouve l'identité**. Le QR que le client présente porte un jeton opaque
 * (`handoverToken`) ; l'attestation, elle, est l'appel authentifié que le staff
 * émet juste après. Ni l'un ni l'autre ne suffit seul.
 *
 * D'où le refus d'encoder le **numéro de commande** dans le QR : il est imprimé
 * sur le bon de livraison, séquentiel, et lisible par quiconque tient le colis.
 * Un identifiant public ne peut pas servir de preuve. Le jeton, lui, est
 * aléatoire et n'apparaît que dans l'écran du client.
 */

/** Une ligne à vérifier au comptoir : ce qu'on compte, pas ce qu'on facture. */
export interface OrderHandoverLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * Ce que le staff voit après avoir scanné, **avant** de confirmer.
 *
 * Aucun montant, délibérément — même raison que sur le bon de livraison : celui
 * qui remet un colis coche des articles, il n'a pas à faire apparaître un prix
 * négocié devant la personne qui attend au comptoir.
 *
 * `blockedReason` porte le refus **en clair** plutôt qu'un booléen : quand la
 * remise est impossible, la seule chose utile à l'écran est *pourquoi*, et c'est
 * le serveur qui le sait (état de la commande, remise déjà faite).
 */
export interface OrderHandoverView {
  /** Pour ouvrir la fiche complète quand le comptoir ne suffit pas. */
  readonly orderId: string;
  readonly orderNumber: string;
  /** La raison sociale, ou la personne si la commande est sans entreprise. */
  readonly customerLabel: string;
  /** ISO. Passée le. */
  readonly placedAt: string;
  /** Date souhaitée (`AAAA-MM-JJ`), ou `null`. */
  readonly requestedDeliveryDate: string | null;
  /** Nom du point de retrait figé à la commande, ou `null` s'il n'en portait pas. */
  readonly pickupLabel: string | null;
  /** Somme des quantités — le chiffre qu'on recompte à voix haute. */
  readonly totalUnits: number;
  readonly lines: readonly OrderHandoverLine[];
  /** ISO de la remise déjà effectuée, ou `null` si elle reste à faire. */
  readonly handedOverAt: string | null;
  /** Qui l'a remise — l'identité staff figée (claim `sub`) —, ou `null`. */
  readonly handedOverBy: string | null;
  /**
   * **Comment** elle a été constatée : `scan` (les deux parties étaient là) ou
   * `manual` (le scan était impossible, l'équipe a saisi). `null` tant qu'elle
   * n'a pas été remise — ou sur une remise antérieure à la distinction.
   *
   * L'écran l'affiche : une remise saisie est une attestation **plus faible**,
   * et la présenter comme un scan la rendrait fausse plutôt que faible.
   */
  readonly handedOverVia: string | null;
  /** `null` = la remise est possible ; sinon la raison du refus, en clair. */
  readonly blockedReason: string | null;
}

/**
 * **La file du comptoir**, pour un jour de service.
 *
 * ## Pourquoi une vue à part de `OrderHandoverView`
 *
 * Les deux parlent de remise et ne servent pas le même geste. La vue détaillée
 * répond « qu'est-ce que je tends à cette personne » — elle porte les lignes,
 * le total, la raison d'un refus. Celle-ci répond « qui attend, et depuis
 * quand » : des dizaines de lignes, aucune ligne de marchandise.
 *
 * 🔴 Les fondre reviendrait à charger le détail de quarante commandes pour
 * n'en ouvrir qu'une. C'est le coût que la séparation évite, et c'est la seule
 * raison d'avoir deux vues.
 */
export interface HandoverQueueView {
  /** Le jour demandé, `AAAA-MM-JJ` — renvoyé pour que l'écran sache ce qu'il montre. */
  readonly day: string;
  readonly entries: readonly HandoverQueueEntryView[];
}

/** Une ligne de la file. **Aucun montant** : on ne facture pas au comptoir. */
export interface HandoverQueueEntryView {
  /** Pour ouvrir le bon quand le comptoir ne suffit pas. */
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
  /** Le point de retrait figé à la commande, ou `null` en livraison. */
  readonly pickupLabel: string | null;
  readonly fulfillmentMethod: string;
  /** Le créneau convenu, ou `null` si aucune tranche n'a été demandée. */
  readonly window: HandoverQueueWindowView | null;
  /** Somme des quantités — le chiffre qu'on recompte à voix haute. */
  readonly totalUnits: number;
  /** ISO. Passée le. */
  readonly placedAt: string;
  /**
   * Où en est la commande, du point de vue du COMPTOIR — et pas le statut brut
   * du commerce, que personne au comptoir n'a à interpréter.
   *
   * `handed_over` gagne sur tout le reste : une commande remise est remise,
   * même si son statut commercial a bougé depuis.
   */
  readonly state: HandoverQueueState;
  /** ISO de la remise, ou `null`. */
  readonly handedOverAt: string | null;
  /** `scan` ou `manual`, ou `null` si elle reste à faire. */
  readonly handedOverVia: string | null;
  /** ISO du moment où le fournil l'a déclarée prête, ou `null`. */
  readonly readyAt: string | null;
}

/**
 * L'état d'une ligne de file.
 *
 * ⚠️ **`cancelled` est RENDU, pas masqué.** Une commande annulée dont le client
 * se présente quand même doit pouvoir être trouvée à l'écran : c'est la seule
 * façon que l'équipe puisse lui dire pourquoi on ne lui donne rien. Une file qui
 * la cacherait laisserait quelqu'un chercher une commande « disparue ».
 */
export type HandoverQueueState = "handed_over" | "ready" | "expected" | "cancelled";

/**
 * Le créneau, **avec sa provenance**.
 *
 * 🔴 `default` = heure d'ouverture du point, recopiée à la passation. `override`
 * = tranche réellement demandée. **Seul un `override` autorise à parler de
 * retard** : le backfill du 2026-08-15 a posé un `default` sur l'intégralité des
 * commandes antérieures, et un écran qui l'ignorerait afficherait « en retard »
 * sur tout le portefeuille d'un coup.
 */
export interface HandoverQueueWindowView {
  /** `null` = aucune borne basse, c'est-à-dire « avant `end` ». */
  readonly start: string | null;
  readonly end: string;
  readonly source: string;
}

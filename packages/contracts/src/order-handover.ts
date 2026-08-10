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
  /** `null` = la remise est possible ; sinon la raison du refus, en clair. */
  readonly blockedReason: string | null;
}

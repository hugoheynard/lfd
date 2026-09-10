import type { FulfillmentMethod, OrderStatus } from "@lfd/contracts";

/**
 * **Ce que le commerce sait d'une commande qu'on s'apprête à remettre.**
 *
 * Le fournil constate la remise ; il ne connaît pas la commande. Il déclare donc
 * ce dont il a besoin pour juger et pour afficher, et le commerce le fournit —
 * même figure que `DayOrdersReader`, et pour la même raison : un port publié
 * ici, un adaptateur là-bas, reliés dans la racine de composition.
 *
 * ⚠️ **Aucun champ de remise**. `handedOverAt`, `handedOverBy`, `handedOverVia`
 * appartiennent maintenant à la production, dans SA table. Les faire remonter
 * par ce port créerait deux vérités sur le même fait, et c'est exactement
 * l'endroit où elles divergeraient : le commerce recopie ce que le fournil lui
 * annonce, il ne le lui rend pas.
 */
export interface HandoverSubject {
  /** Opaque. Le fournil le garde pour en reparler, jamais pour aller lire. */
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
  /** L'état côté COMMERCE — la règle de remise le lit, elle ne l'écrit pas. */
  readonly status: OrderStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  readonly lines: readonly HandoverSubjectLine[];
}

/** Ce qu'on recompte à voix haute au comptoir. Aucun montant : on ne facture pas ici. */
export interface HandoverSubjectLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/**
 * **Le port de lecture des commandes à remettre**, publié par la production.
 *
 * Deux chemins d'accès parce qu'il y a deux gestes, et un seul serait un piège :
 * le scan trouve par un **secret**, la saisie par un **numéro imprimé**. Les
 * fondre en une seule méthode ferait accepter le numéro là où le secret est la
 * protection.
 *
 * Aucune règle n'est appliquée ici — le port rend l'état, `handoverBlocker` dit
 * si le geste est possible. Une seule voix pour une seule règle.
 */
export abstract class HandoverSubjectReader {
  /**
   * La commande derrière ce **jeton de remise**, ou `null` s'il n'ouvre rien.
   *
   * Le jeton est le secret que le client présente : c'est lui qui fait du scan
   * une preuve, parce qu'il faut avoir été DEUX pour l'obtenir.
   */
  abstract byToken(token: string): Promise<HandoverSubject | null>;

  /**
   * La même commande, trouvée par son **numéro** — le chemin de la saisie, quand
   * le code n'est pas présentable.
   *
   * Le numéro n'est pas un secret : il est imprimé sur le bon. Ce qui protège
   * cette porte est la session staff, et c'est suffisant parce que saisir une
   * remise est un acte dont l'auteur est enregistré.
   */
  abstract byReference(reference: string): Promise<HandoverSubject | null>;
}

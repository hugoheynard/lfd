import type { FulfillmentMethod, OrderStatus } from "@lfd/contracts";

/**
 * La règle de la **remise en main propre**, pure et sans dépendance : à partir
 * de l'état d'une commande, dire si on peut la remettre — et sinon, pourquoi.
 *
 * Elle rend une **phrase**, pas un booléen. Au comptoir, un refus muet est
 * inexploitable : la personne en face attend, et la seule question qui compte
 * est « qu'est-ce que je lui dis ». La raison est donc portée par la règle
 * elle-même, au même endroit que la décision, pour qu'elles ne divergent jamais.
 */

/** État d'une commande, réduit à ce dont la règle a besoin. */
export interface HandoverSubject {
  readonly status: OrderStatus;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** ISO ou `Date` de la remise déjà faite ; `null` = elle reste à faire. */
  readonly handedOverAt: Date | null;
}

/**
 * Ce qui **empêche** la remise, en clair — ou `null` si rien ne l'empêche.
 *
 * Volontairement permissif sur l'avancement : tout état autre que `draft` et
 * `cancelled` passe. Refuser une commande encore `placed` reviendrait à renvoyer
 * un client qui est physiquement là, colis prêt, parce qu'un écran d'atelier n'a
 * pas été cliqué. Le monde réel prime sur la machine à états — et il n'existe
 * aujourd'hui **aucune** transition automatique vers `confirmed`, ce qui rendrait
 * la porte définitivement fermée.
 *
 * Le mode d'acheminement, lui, est ferme : une commande en coursier n'a pas de
 * comptoir, et confirmer sa remise ici masquerait une livraison jamais faite.
 */
export function handoverBlocker(subject: HandoverSubject): string | null {
  if (subject.fulfillmentMethod !== "pickup") {
    return "Cette commande est en livraison — elle ne se remet pas au comptoir.";
  }
  if (subject.status === "cancelled") {
    return "Cette commande est annulée.";
  }
  if (subject.status === "draft") {
    return "Cette commande n'est pas encore passée.";
  }
  if (subject.handedOverAt !== null) {
    return "Cette commande a déjà été remise.";
  }
  return null;
}

/**
 * Une remise se **matérialise** par un jeton, et seul le retrait en a un.
 *
 * En émettre un pour une livraison créerait une porte inutilisable dont personne
 * ne saurait, au moment de l'auditer, si elle est morte ou oubliée.
 */
export function issuesHandoverToken(method: FulfillmentMethod): boolean {
  return method === "pickup";
}

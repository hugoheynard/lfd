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
 * 🔴 **Le mode d'acheminement ne bloque plus, depuis le 2026-09-07.** Cette
 * fonction refusait toute commande en coursier — « elle ne se remet pas au
 * comptoir ». C'était vrai tant qu'une livraison n'avait aucun chemin vers
 * `fulfilled` : elle restait `placed` pour toujours, livrée ou non.
 *
 * La symétrie est désormais exacte. En retrait, le client montre son code et
 * l'équipe scanne ; en livraison, le destinataire montre le code de son courriel
 * et **le coursier scanne** avec sa session staff. Même jeton, même porte, même
 * geste — ce qui reste ferme, c'est qu'il faut être **deux**.
 */
export function handoverBlocker(subject: HandoverSubject): string | null {
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
 * Une remise se **matérialise** par un jeton, et **les deux acheminements en ont
 * un** depuis le 2026-09-07.
 *
 * ⚠️ **La raison écrite ici jusqu'à ce jour disait le contraire**, et il faut la
 * citer plutôt que la faire disparaître :
 *
 * > « En émettre un pour une livraison créerait une porte inutilisable dont
 * > personne ne saurait, au moment de l'auditer, si elle est morte ou
 * > oubliée. »
 *
 * Elle était **vraie** quand elle a été écrite : aucune remise en livraison
 * n'existait, donc le jeton n'aurait ouvert sur rien. Le jour où le coursier
 * scanne, la porte est utilisée — la raison tombe **avec son motif**, et c'est
 * la façon propre de la retirer. La réécrire sans le dire laisserait croire
 * qu'elle n'a jamais été vraie.
 *
 * La fonction reste, bien qu'elle rende toujours `true`, et **perd son
 * paramètre** : elle ne dépend plus de l'acheminement, et le lui passer encore
 * laisserait croire qu'il pèse. Elle **nomme** la décision — un
 * `handoverToken: this.secrets.next()` posé sans elle serait un choix
 * qu'aucun lecteur ne pourrait plus retrouver.
 */
export function issuesHandoverToken(): boolean {
  return true;
}

/**
 * **Comment** une remise a été constatée.
 *
 * `scan` — les deux parties étaient là : l'une a présenté, l'autre a scanné.
 * C'est l'attestation forte, et la seule qui exige un secret.
 *
 * `manual` — le scan était impossible et l'équipe a saisi la remise. Le
 * destinataire n'avait pas son courriel : un magasinier, quelqu'un d'autre à
 * l'accueil, un téléphone déchargé.
 *
 * 🔴 **Les deux ne se confondent pas, et c'est tout l'objet de ce champ.** Sans
 * lui, quelqu'un finirait par imprimer le code sur le colis « pour les
 * livraisons difficiles » — et un coursier scannerait son propre carton. Une
 * attestation **faible et honnête** vaut mieux qu'une attestation forte et
 * fausse ; encore faut-il pouvoir les distinguer.
 */
export type HandoverVia = "scan" | "manual";

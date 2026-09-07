import type { OrderStatus } from "@lfd/contracts";

/**
 * La règle de la **remise en main propre**, pure et sans dépendance : à partir
 * de l'état d'une commande, dire si on peut la remettre — et sinon, pourquoi.
 *
 * Elle rend une **phrase**, pas un booléen. Au comptoir, un refus muet est
 * inexploitable : la personne en face attend, et la seule question qui compte
 * est « qu'est-ce que je lui dis ». La raison est donc portée par la règle
 * elle-même, au même endroit que la décision, pour qu'elles ne divergent jamais.
 *
 * 🔴 **Cette règle vivait dans `b2b/orders/domain/services/`** jusqu'au
 * 2026-09-07. Elle a suivi le fait qu'elle gouverne : c'est au labo qu'on
 * retire, et une règle qui décide d'un geste doit vivre là où le geste se fait.
 */

/**
 * L'état réduit à ce dont la règle a besoin — et à rien de plus.
 *
 * ⚠️ Le **mode d'acheminement n'y est plus**. L'ancienne version le portait sans
 * jamais le lire depuis que la livraison a cessé de bloquer (2026-09-07) : un
 * champ qu'une règle reçoit sans l'ouvrir laisse croire qu'il pèse, et le
 * prochain lecteur cherche où.
 */
export interface HandoverCandidate {
  readonly status: OrderStatus;
  /**
   * L'instant de la remise **déjà constatée par le fournil**, ou `null`.
   *
   * Il vient de la table de production, jamais du commerce : c'est le fournil
   * qui détient ce fait depuis qu'il le constate.
   */
  readonly handedOverAt: Date | null;
}

/**
 * Ce qui **empêche** la remise, en clair — ou `null` si rien ne l'empêche.
 *
 * Volontairement permissif sur l'avancement : tout état autre que `draft` et
 * `cancelled` passe. Refuser une commande encore `placed` reviendrait à renvoyer
 * un client qui est physiquement là, colis prêt, parce qu'un écran d'atelier n'a
 * pas été cliqué. Le monde réel prime sur la machine à états.
 *
 * ⚠️ C'est cette permissivité qui a décidé de la FORME de la table : une
 * commande passée après la clôture de sa journée n'est dans aucun plan, et reste
 * remettable. La remise ne pouvait donc pas s'accrocher à `production_order`.
 *
 * **Le mode d'acheminement ne bloque pas**, depuis le 2026-09-07. En retrait, le
 * client montre son code et l'équipe scanne ; en livraison, le destinataire
 * montre le code de son courriel et **le coursier scanne** avec sa session
 * staff. Même jeton, même porte, même geste — ce qui reste ferme, c'est qu'il
 * faut être **deux**.
 */
export function handoverBlocker(candidate: HandoverCandidate): string | null {
  if (candidate.status === "cancelled") {
    return "Cette commande est annulée.";
  }
  if (candidate.status === "draft") {
    return "Cette commande n'est pas encore passée.";
  }
  if (candidate.handedOverAt !== null) {
    return "Cette commande a déjà été remise.";
  }
  return null;
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
 * 🔴 **Les deux ne se confondent pas, et c'est tout l'objet de ce type.** Sans
 * lui, quelqu'un finirait par imprimer le code sur le colis « pour les
 * livraisons difficiles » — et un coursier scannerait son propre carton. Une
 * attestation **faible et honnête** vaut mieux qu'une attestation forte et
 * fausse ; encore faut-il pouvoir les distinguer.
 */
export type HandoverVia = "scan" | "manual";

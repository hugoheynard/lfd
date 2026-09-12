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
 * **Comment** une remise a été constatée — repris du contrat, pas redéfini.
 *
 * 🔴 Il était déclaré ici, et le contrat portait `string` à sa place : deux
 * définitions du même ensemble, dont une qui ne définissait rien. C'est le
 * contrat qui le porte depuis le 2026-09-11, parce que c'est lui que les deux
 * côtés lisent. Le domaine le réexporte pour que ses lecteurs n'aient pas à
 * savoir d'où il vient.
 */
export type { HandoverVia } from "@lfd/contracts";

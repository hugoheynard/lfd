import type { OrderStatus } from "@lfd/contracts";

import { FIRST_SHIPMENT_RANK } from "../../../production/channels/handover/index.js";

/**
 * La règle du **retrait en main propre**, pure et sans dépendance : à partir
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
   * Le rang de l'envoi qu'on s'apprête à remettre — 1 = la commande elle-même,
   * au-delà un reliquat (plan E7 reliquat, lot L4b). Il ne change que la phrase
   * de « déjà retiré » : c'est l'envoi qui l'a été, pas forcément la commande.
   */
  readonly rank: number;
  /**
   * L'instant du retrait **déjà constaté par le fournil**, ou `null`.
   *
   * Il vient de la table de production, jamais du commerce : c'est le fournil
   * qui détient ce fait depuis qu'il le constate.
   */
  readonly handedOverAt: Date | null;
  /**
   * L'envoi est **prêt à tendre** (plan E7 reliquat, L4c). Toujours vrai au
   * rang 1 — la règle est permissive sur l'avancement de la commande, cf.
   * {@link handoverBlocker} ; au-delà, le bac du reste est fermé
   * (`shipmentPrepared`). Un reste prévu, pas encore colisé, n'existe pas
   * encore en sac.
   */
  readonly prepared: boolean;
  /**
   * La commande est **retenue par un contrôle qualité** — dit par la
   * production (`QualityHoldsReader`), jamais déduit ici.
   *
   * Peut être vrai d'une commande déjà partie : la production ne sait pas ce
   * qui a été remis. C'est l'ordre des refus qui rend ce cas inoffensif.
   */
  readonly qualityHold: boolean;
  /**
   * Réglée — encaissée, ou au compte —, dit par le commerce
   * (`HandoverSubject.settled`).
   */
  readonly settled: boolean;
}

/**
 * La phrase d'une retenue au contrôle. Elle ne dit PAS le motif : elle est lue
 * devant le client, et le motif est sur la Supervision
 * (`plan-controle-qualite.md`, D4).
 */
export const QUALITY_HOLD_REASON = "Commande en cours de vérification.";

/**
 * La phrase d'une commande non réglée — une carte qui n'a pas abouti, ou une
 * commande remboursée avant son retrait. Elle dit le geste : ne pas remettre,
 * renvoyer le client vers son espace ou vers le bureau.
 */
export const UNSETTLED_REASON =
  "Cette commande n'est pas réglée : son paiement par carte n'est pas encaissé. Ne la remettez pas ; le client peut la régler depuis « Mes commandes », sinon appelez le bureau.";

/**
 * Ce qui **empêche** le retrait, en clair — ou `null` si rien ne l'empêche.
 *
 * Volontairement permissif sur l'avancement : tout état autre que `draft` et
 * `cancelled` passe. Refuser une commande encore `placed` reviendrait à renvoyer
 * un client qui est physiquement là, colis prêt, parce qu'un écran d'atelier n'a
 * pas été cliqué. Le monde réel prime sur la machine à états.
 *
 * ⚠️ C'est cette permissivité qui a décidé de la FORME de la table : une
 * commande passée après la clôture de sa journée n'est dans aucun plan, et reste
 * remettable. Le retrait ne pouvait donc pas s'accrocher à `production_order`.
 *
 * **Le mode d'acheminement ne bloque pas**, depuis le 2026-09-07. En retrait, le
 * client montre son code et l'équipe scanne ; en livraison, le destinataire
 * montre le code de son courriel et **le coursier scanne** avec sa session
 * staff. Même jeton, même porte, même geste — ce qui reste ferme, c'est qu'il
 * faut être **deux**.
 *
 * 🔴 **La retenue qualité est lue EN DERNIER**, après « annulée », « pas
 * passée » et « déjà retirée » (`plan-controle-qualite.md`, D4). La production
 * ne peut pas savoir ce qui est parti — `order_handover` n'est pas à elle —, et
 * un blocage de ligne retient toutes les commandes du plan qui portent le
 * produit, parties comprises (D6). Lue avant, elle ferait répondre « en
 * vérification » à un scan rejoué sur un sac déjà remis : un mensonge sur un
 * fait physique. Lue après, une retenue sur un sac parti est inoffensive.
 *
 * 🔴 **Le règlement est lu après « déjà retirée »**, pour la même raison : une
 * commande remboursée après son retrait est partie, et le dire d'abord est le
 * seul fait vrai. Il passe avant la retenue qualité : une commande qu'on ne
 * remettra pas faute de paiement n'a rien à attendre du contrôle
 * (`commande-carte-reglee.md`, §4.4, 2026-10-09).
 */
export function handoverBlocker(candidate: HandoverCandidate): string | null {
  if (candidate.status === "cancelled") {
    return "Cette commande est annulée.";
  }
  if (candidate.status === "draft") {
    return "Cette commande n'est pas encore passée.";
  }
  if (candidate.handedOverAt !== null) {
    return candidate.rank === FIRST_SHIPMENT_RANK
      ? "Cette commande a déjà été retirée."
      : `Le reste de cette commande (envoi ${String(candidate.rank)}) a déjà été retiré.`;
  }
  if (!candidate.prepared) {
    return notPreparedReason(candidate.rank);
  }
  if (!candidate.settled) {
    return UNSETTLED_REASON;
  }
  if (candidate.qualityHold) {
    return QUALITY_HOLD_REASON;
  }
  return null;
}

/**
 * La phrase d'un reste pas encore colisé : il n'y a pas de sac à tendre, et
 * c'est au colisage qu'il se prépare.
 */
export function notPreparedReason(rank: number): string {
  return `Le reste de cette commande (envoi ${String(rank)}) n'est pas prêt : son bac n'a pas été fermé au colisage. Ne le remettez pas encore.`;
}

/**
 * **Comment** un retrait a été constaté — repris du contrat, pas redéfini.
 *
 * 🔴 Il était déclaré ici, et le contrat portait `string` à sa place : deux
 * définitions du même ensemble, dont une qui ne définissait rien. C'est le
 * contrat qui le porte depuis le 2026-09-11, parce que c'est lui que les deux
 * côtés lisent. Le domaine le réexporte pour que ses lecteurs n'aient pas à
 * savoir d'où il vient.
 */
export type { HandoverVia } from "@lfd/contracts";

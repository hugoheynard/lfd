import type { DeadlineOrder } from "../services/deadline-thresholds.js";

/**
 * Une commande du jour réduite à son échéance, et le site qui la remet tel que
 * figé à la passation (lot S2) — `null` : livraison, ou commande d'avant le
 * lot. Le site RÉSOLU (`DeadlineOrder.site`) est posé ensuite par
 * l'application, qui seule lit les réglages des sites.
 */
export interface SitedDeadlineOrder extends DeadlineOrder {
  readonly siteId: string | null;
}

/**
 * **Les commandes d'une journée, réduites à leur échéance** — le mode, la
 * fenêtre convenue, le site et les lignes, rien d'autre (plan production par
 * vagues, V0).
 *
 * Un port à lui (ISP) : le lecteur de la clôture rend client et destination,
 * dont le compte à rebours n'a que faire, et pas la fenêtre, dont il a besoin.
 * Périmètre : les commandes encore vivantes (`STATUSES_AWAITING_PICKUP`,
 * hors annulées et remises) au règlement admis (`settlementWhere`), avant
 * comme après l'arrêt du plan. Ce n'est PAS celui de la clôture (`planWhere`,
 * `placed` seul) : jusqu'au 2026-10-24, ce lecteur le partageait, rendait une
 * liste vide une fois la journée arrêtée (commandes `confirmed`), et la section
 * « Échéances » du dossier du jour affichait « Aucune commande n'est au plan »
 * au moment même où le fournil travaillait. Même défaut, même correction que
 * le transfert d'un site (`SiteArrivalOrdersReader`).
 */
export abstract class DeadlineOrdersReader {
  /** `day` : `AAAA-MM-JJ`. */
  abstract forDay(day: string): Promise<readonly SitedDeadlineOrder[]>;
}

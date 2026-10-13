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
 * Même périmètre « producible » que la clôture (`planWhere`).
 */
export abstract class DeadlineOrdersReader {
  /** `day` : `AAAA-MM-JJ`. */
  abstract forDay(day: string): Promise<readonly SitedDeadlineOrder[]>;
}

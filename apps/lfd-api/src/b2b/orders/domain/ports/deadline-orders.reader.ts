import type { DeadlineOrder } from "../services/deadline-thresholds.js";

/**
 * **Les commandes d'une journée, réduites à leur échéance** — le mode, la
 * fenêtre convenue et les lignes, rien d'autre (plan production par vagues, V0).
 *
 * Un port à lui (ISP) : le lecteur de la clôture rend client et destination,
 * dont le compte à rebours n'a que faire, et pas la fenêtre, dont il a besoin.
 * Même périmètre « producible » que la clôture (`planWhere`).
 */
export abstract class DeadlineOrdersReader {
  /** `day` : `AAAA-MM-JJ`. */
  abstract forDay(day: string): Promise<readonly DeadlineOrder[]>;
}

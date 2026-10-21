import type { ResupplyReceiptSnapshot } from "./resupply-receipt.js";
import type { PlacedSiteResupplySnapshot } from "./site-resupply.js";

/** Un point de retrait, tel que l'onglet Stock le nomme. */
export interface DayStockSite {
  readonly id: string;
  readonly label: string;
}

/**
 * Port de **lecture** de l'onglet Stock de la Supervision (lot S1) — une
 * journée, TOUS points : la Supervision regarde, elle n'écrit rien. Distinct
 * des lecteurs du comptoir, qui lisent un point à la fois, et de celui du
 * fournil, qui écarte les annulés (ISP).
 */
export abstract class DayStockReader {
  /** Les points de retrait non archivés, dans l'ordre des points (création). */
  abstract sites(): Promise<readonly DayStockSite[]>;

  /** Les réassorts ENVOYÉS de tous les points pour la journée, annulés compris, dans l'ordre d'envoi. */
  abstract resuppliesOn(serviceDay: string): Promise<readonly PlacedSiteResupplySnapshot[]>;

  /** Les reçus de tous les points pour la journée, dans l'ordre de réception. */
  abstract receiptsOn(serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]>;
}

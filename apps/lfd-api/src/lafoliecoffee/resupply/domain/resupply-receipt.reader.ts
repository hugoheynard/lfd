import type { ResupplyReceiptSnapshot } from "./resupply-receipt.js";

/**
 * Port de **lecture** des reçus — distinct du port d'écriture (ISP) : la page
 * du comptoir les liste pour une journée, elle ne les mute pas.
 */
export abstract class ResupplyReceiptReader {
  /** Tous les reçus du point pour cette journée, dans l'ordre de réception. */
  abstract on(siteId: string, serviceDay: string): Promise<readonly ResupplyReceiptSnapshot[]>;
}

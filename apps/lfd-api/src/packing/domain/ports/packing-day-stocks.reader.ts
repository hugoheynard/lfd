import type { PackingStockSnapshot } from "../entities/packing-stock.js";

/**
 * **Les réserves d'une journée, en lecture, sans verrou** (réassort, lot R4b) —
 * avec leurs réservations : la liste des fiches de réassort en tire « en
 * attente du four ». Port de LECTURE, séparé de `PackingStockRepository`
 * (ISP) : l'écran ne verrouille rien.
 */
export abstract class PackingDayStocksReader {
  abstract on(serviceDay: string): Promise<readonly PackingStockSnapshot[]>;
}

import type { BoardOrder, BoardStock } from "./packing-board.reader.js";

/**
 * La fiche d'une commande et les réserves de SES articles, le jour où elle
 * est au poste — ce qu'il faut pour dire, au comptoir, ce qui attend le four.
 */
export interface CounterPackingSheetSource {
  readonly order: BoardOrder;
  readonly stocks: readonly BoardStock[];
}

/**
 * **La fiche de colis d'UNE commande, en lecture** — pour le rail du comptoir
 * (2026-11-03).
 *
 * Port distinct de `PackingBoardReader` (ISP) : le poste lit toute une
 * journée, le comptoir une seule commande, sans connaître son jour.
 */
export abstract class CounterPackingSheetReader {
  /**
   * La fiche du rang 1 la plus récente de la commande, hors feuille retirée ;
   * `null` quand la commande n'est sur aucune liste à coliser.
   */
  abstract latestOf(orderId: string): Promise<CounterPackingSheetSource | null>;
}

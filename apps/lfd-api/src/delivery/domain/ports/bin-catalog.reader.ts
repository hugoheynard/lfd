import type { BinCapacityView, BinTypeView } from "@lfd/contracts";

/** Port de **lecture** du catalogue des bacs et de sa grille. */
export abstract class BinCatalogReader {
  /** Tous les types, archivés compris, dans l'ordre de création. */
  abstract listTypes(): Promise<readonly BinTypeView[]>;

  /** Les cases renseignées des types NON archivés. */
  abstract activeCapacities(): Promise<readonly BinCapacityView[]>;
}

import type { BakehouseResupplyDraftSnapshot } from "./bakehouse-resupply-draft.js";

/** Port de **lecture** des brouillons du fournil, pour la liste de la carte. */
export abstract class BakehouseResupplyDraftReader {
  /** Les brouillons ouverts, le dernier enregistré d'abord. */
  abstract listOpen(): Promise<readonly BakehouseResupplyDraftSnapshot[]>;
}

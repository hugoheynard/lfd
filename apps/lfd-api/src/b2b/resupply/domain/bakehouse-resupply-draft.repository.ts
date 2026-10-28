import type { BakehouseResupplyDraft } from "./bakehouse-resupply-draft.js";

/**
 * Port d'**écriture** des brouillons du fournil : l'agrégat entier, chargé
 * puis rendu. `save` insère un brouillon neuf (version 0) et réécrit les
 * autres sous la version lue — une version périmée lève
 * `BakehouseResupplyDraftChangedMeanwhileError`.
 */
export abstract class BakehouseResupplyDraftRepository {
  abstract load(draftId: string): Promise<BakehouseResupplyDraft | null>;

  abstract save(draft: BakehouseResupplyDraft): Promise<void>;
}

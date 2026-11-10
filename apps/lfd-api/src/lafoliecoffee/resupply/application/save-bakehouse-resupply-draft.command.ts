import type { BakehouseResupplyDraftContent } from "../domain/bakehouse-resupply-draft.js";

/** Réécrire un brouillon repris, sous la version lue. Rend `{ id, version }`. */
export class SaveBakehouseResupplyDraftCommand {
  constructor(
    readonly draftId: string,
    readonly content: BakehouseResupplyDraftContent,
    readonly version: number,
    readonly staffUserId: string,
  ) {}
}

import type { BakehouseResupplyDraftContent } from "../domain/bakehouse-resupply-draft.js";

/** « Enregistrer comme brouillon », la première fois. Rend `{ id, version }`. */
export class CreateBakehouseResupplyDraftCommand {
  constructor(
    readonly content: BakehouseResupplyDraftContent,
    readonly staffUserId: string,
  ) {}
}

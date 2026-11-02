import type { BakehouseResupplyDraftContent } from "../domain/bakehouse-resupply-draft.js";

/**
 * « Enregistrer comme brouillon », la première fois. Rend `{ id, version }`.
 *
 * `key` est fournie par l'écran, une par ouverture du panneau : elle devient
 * l'identifiant du brouillon, et un second enregistrement avec la même clé
 * rend le brouillon déjà écrit (C-C, audit du 2026-11-02).
 */
export class CreateBakehouseResupplyDraftCommand {
  constructor(
    readonly content: BakehouseResupplyDraftContent,
    readonly staffUserId: string,
    readonly key: string,
  ) {}
}

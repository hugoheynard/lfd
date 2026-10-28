import type { SavedBakehouseResupplyDraftResponse } from "@lfd/contracts";

import type { BakehouseResupplyDraft } from "../domain/bakehouse-resupply-draft.js";
import { BakehouseResupplyDraftNotFoundError } from "../domain/bakehouse-resupply-draft-errors.js";
import type { BakehouseResupplyDraftRepository } from "../domain/bakehouse-resupply-draft.repository.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import type { ResupplySites } from "../domain/resupply-sites.js";

/** Gardes PARTAGÉES par les cas des brouillons du fournil. */

/** Le brouillon visé, ou 404. */
export async function loadBakehouseDraft(
  drafts: BakehouseResupplyDraftRepository,
  draftId: string,
): Promise<BakehouseResupplyDraft> {
  const draft = await drafts.load(draftId);
  if (draft === null) {
    throw new BakehouseResupplyDraftNotFoundError(draftId);
  }
  return draft;
}

/** Le point visé doit exister et ne pas être archivé. */
export async function ensureSiteExists(sites: ResupplySites, siteId: string): Promise<void> {
  if (!(await sites.exists(siteId))) {
    throw new ResupplySiteUnknownError(siteId);
  }
}

/** Écrit le brouillon et rend ce que l'écran relira. */
export async function savedDraft(
  drafts: BakehouseResupplyDraftRepository,
  draft: BakehouseResupplyDraft,
): Promise<SavedBakehouseResupplyDraftResponse> {
  await drafts.save(draft);
  return { id: draft.id, version: draft.nextVersion };
}

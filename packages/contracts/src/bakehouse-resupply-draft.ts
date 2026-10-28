import { z } from "zod";

import { RESUPPLY_TARGETS, type ResupplyTarget } from "./site-resupply.js";

/**
 * **Le brouillon d'un réassort du fournil** (Hugo, 2026-10-28 : « j'ai besoin
 * d'un enregistrer comme brouillon ») — plan
 * `documentation/reassort-boutiques/plan-brouillons-du-fournil.md`.
 *
 * Une composition gardée AU SERVEUR, retrouvée depuis n'importe quel poste du
 * fournil, et qui ne devient un réassort qu'à l'envoi. À part de la demande en
 * cours du comptoir comme des réassorts envoyés : elle n'a pas de journée —
 * celle-ci se calcule à l'envoi, depuis la visée.
 */

/** Une ligne : un article du catalogue et sa quantité, sans libellé — l'écran le lit au catalogue. */
export const bakehouseResupplyDraftLineSchema = z
  .object({
    sku: z.string().trim().min(1),
    quantity: z.number().int().positive(),
  })
  .strict();
export type BakehouseResupplyDraftLine = z.infer<typeof bakehouseResupplyDraftLineSchema>;

/**
 * Ce qu'un enregistrement envoie : le contenu ENTIER du brouillon, qui
 * remplace le précédent. `siteId` et au moins une ligne sont exigés : un
 * brouillon vide, ou sans point, ne se retrouverait pas.
 */
export const saveBakehouseResupplyDraftSchema = z
  .object({
    siteId: z.string().trim().min(1),
    target: z.enum(RESUPPLY_TARGETS),
    /** Son nom (R1g) ; `null` ou vide : sans nom. */
    name: z.string().nullable(),
    lines: z.array(bakehouseResupplyDraftLineSchema).min(1).max(200),
  })
  .strict();
export type SaveBakehouseResupplyDraftPayload = z.infer<typeof saveBakehouseResupplyDraftSchema>;

/**
 * `PUT /admin/bakehouse-resupplies/drafts/:draftId` et
 * `POST …/drafts/:draftId/send` : le contenu, plus la version LUE — deux
 * postes qui reprennent le même brouillon ne s'écrasent pas (409).
 */
export const updateBakehouseResupplyDraftSchema = saveBakehouseResupplyDraftSchema
  .extend({ version: z.number().int().positive() })
  .strict();
export type UpdateBakehouseResupplyDraftPayload = z.infer<
  typeof updateBakehouseResupplyDraftSchema
>;

/** `POST …/drafts/:draftId/discard` : la version lue. */
export const discardBakehouseResupplyDraftSchema = z
  .object({ version: z.number().int().positive() })
  .strict();
export type DiscardBakehouseResupplyDraftPayload = z.infer<
  typeof discardBakehouseResupplyDraftSchema
>;

/** Un brouillon ouvert, tel que la carte le liste puis le reprend. */
export interface BakehouseResupplyDraftView {
  readonly id: string;
  readonly version: number;
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly name: string | null;
  readonly lines: readonly BakehouseResupplyDraftLine[];
  /** Le dernier enregistrement : son auteur (nom figé) et son instant ISO. */
  readonly savedByName: string;
  readonly savedAt: string;
}

/** `POST …/drafts` (création) et `PUT …/drafts/:draftId` : l'identité et la version écrite. */
export interface SavedBakehouseResupplyDraftResponse {
  readonly id: string;
  readonly version: number;
}

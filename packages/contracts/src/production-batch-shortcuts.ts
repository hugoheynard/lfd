import { z } from "zod";

/**
 * **Les raccourcis du fournil** — compter en plaques (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, 2026-10-28).
 *
 * Un raccourci est, pour UN produit, un nom (« 1 plaque » par défaut) et un
 * nombre de pièces. Sur la fiche d'atelier, chaque appui AJOUTE ses pièces au
 * champ « Pièces sorties » ; ce qui s'enregistre reste un nombre de pièces.
 */

/** Au plus six raccourcis par produit (plan §2). */
export const MAX_BATCH_SHORTCUTS_PER_PRODUCT = 6;

/** Un nom de raccourci, rogné, tient en 1 à 30 caractères (plan §2). */
export const BATCH_SHORTCUT_LABEL_MAX = 30;

/** Le nom que le dialogue d'ajout propose (plan §2). */
export const DEFAULT_BATCH_SHORTCUT_LABEL = "1 plaque";

/**
 * `POST /admin/production/settings/shortcuts` — la FORME. La longueur du nom,
 * le nombre de pièces, le doublon et le plafond sont jugés par le domaine, qui
 * nomme le refus.
 */
export const createBatchShortcutPayloadSchema = z
  .object({
    sku: z.string().trim().min(1),
    label: z.string(),
    pieces: z.number().int(),
  })
  .strict();
export type CreateBatchShortcutPayload = z.infer<typeof createBatchShortcutPayloadSchema>;

/** `PUT /admin/production/settings/shortcuts/:id` — la forme ; le produit ne change pas. */
export const updateBatchShortcutPayloadSchema = z
  .object({
    label: z.string(),
    pieces: z.number().int(),
  })
  .strict();
export type UpdateBatchShortcutPayload = z.infer<typeof updateBatchShortcutPayloadSchema>;

/** Un raccourci tel que servi. `position` : l'ordre d'affichage parmi ceux du produit. */
export interface BatchShortcutView {
  readonly id: string;
  readonly sku: string;
  readonly label: string;
  readonly pieces: number;
  readonly position: number;
}

/** Un produit vendable, avec sa famille — la ligne de la table des raccourcis. */
export interface BatchShortcutArticleView {
  readonly sku: string;
  readonly name: string;
  readonly familyId: string;
  readonly familyName: string;
}

/**
 * `GET /admin/production/settings/shortcuts` — les articles vendables dans
 * l'ordre du catalogue, et les raccourcis vivants (par SKU, puis position).
 */
export interface BatchShortcutsSettingsView {
  readonly articles: readonly BatchShortcutArticleView[];
  readonly shortcuts: readonly BatchShortcutView[];
}

/** Un bouton de la fiche d'atelier : « + 1 plaque (24) ». */
export interface WorkshopShortcutView {
  readonly id: string;
  readonly label: string;
  readonly pieces: number;
}

/**
 * `GET /admin/production/shortcuts` — les raccourcis vivants, rangés par SKU
 * produit, dans l'ordre de leur position. Un SKU sans raccourci est absent.
 * Sans les articles : la fiche a déjà ses lignes.
 */
export interface WorkshopShortcutsView {
  readonly bySku: Readonly<Record<string, readonly WorkshopShortcutView[]>>;
}

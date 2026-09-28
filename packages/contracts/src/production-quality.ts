import { z } from "zod";

/**
 * **Le contrôle qualité du superviseur** — le contrat des routes de la
 * Supervision (`documentation/production/plan-controle-qualite.md`, lot QC2).
 *
 * Deux lectures, et c'est la règle D3 qui les sépare :
 *
 * - {@link QualityBoardView} — la PASTILLE de chaque cible, lisible en
 *   `b2b_supervision:read` : le verdict courant, la péremption (D5), les
 *   commandes retenues. Ni note, ni photo ;
 * - {@link QualityChecksView} — le DÉTAIL (note, photos, historique), servi en
 *   `b2b_supervision:write` seulement : une photo de contrôle peut montrer une
 *   étiquette, un nom, une adresse.
 *
 * Le geste est coupé en deux (D8) : chaque photo est déposée seule
 * (`QualityPhotoUploaded`), puis le verdict la rattache par son `uploadId`.
 */

/** **10 Mo** par photo — copie de la borne du domaine ; un test tient la parité. */
export const QUALITY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Six photos par contrôle, au plus (D8). */
export const QUALITY_PHOTO_MAX_COUNT = 6;

/** Les trois verdicts ; `warning` se dit « Réserve » à l'écran. */
export const qualityVerdictSchema = z.enum(["ok", "warning", "blocking"]);
export type QualityVerdictCode = z.infer<typeof qualityVerdictSchema>;

const isoDay = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ");

/** La journée lue par les deux routes de lecture. */
export const productionQualityQuerySchema = z.object({ date: isoDay() });
export type ProductionQualityQuery = z.infer<typeof productionQualityQuerySchema>;

/**
 * Ce que l'écran vise : une ligne par son SKU, une commande par son id. La
 * quantité vue d'une ligne n'est PAS envoyée — le serveur la lit au compte.
 */
export const qualityTargetPayloadSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("line"), sku: z.string().trim().min(1).max(64) }),
  z.object({ kind: z.literal("order"), orderId: z.string().trim().min(1).max(64) }),
]);
export type QualityTargetPayload = z.infer<typeof qualityTargetPayloadSchema>;

/** Un ULID : 26 caractères de l'alphabet de Crockford. */
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

/**
 * **Rendre un verdict.** `id` est tiré par l'ÉCRAN (ULID) : rejouer le même
 * `id` rend le contrôle déjà écrit, un autre contenu sous le même `id` est
 * refusé (409). La note est obligatoire hors `ok` — c'est le domaine qui le
 * refuse, avec un message qui dit quoi faire.
 */
export const renderQualityCheckSchema = z.object({
  id: z.string().regex(ULID, "identifiant de contrôle attendu au format ULID"),
  serviceDay: isoDay(),
  target: qualityTargetPayloadSchema,
  verdict: qualityVerdictSchema,
  note: z.string().max(2000).nullable(),
  uploadIds: z
    .array(z.string().min(1).max(64))
    .max(QUALITY_PHOTO_MAX_COUNT)
    .refine((ids) => new Set(ids).size === ids.length, "la même photo est jointe deux fois"),
});
export type RenderQualityCheckPayload = z.infer<typeof renderQualityCheckSchema>;

/** La place d'une photo dans l'URL qui la sert — de 0 à 5. */
export const qualityPhotoPositionSchema = z.coerce
  .number()
  .int()
  .min(0)
  .max(QUALITY_PHOTO_MAX_COUNT - 1);

/** La réponse d'un dépôt de photo : l'identifiant à rattacher au verdict. */
export interface QualityPhotoUploaded {
  readonly uploadId: string;
}

/** La réponse d'un verdict — le même `id`, qu'il soit neuf ou rejoué. */
export interface QualityCheckRendered {
  readonly id: string;
}

/** La pastille d'une ligne : son verdict courant, et s'il vaut encore (D5). */
export interface QualityLineStatus {
  readonly sku: string;
  readonly verdict: QualityVerdictCode;
  readonly checkedAt: string;
  /** Le compte au moment du contrôle. */
  readonly quantitySeen: number;
  /** Le compte actuel ; `null` si le produit a quitté le compte. */
  readonly currentQuantity: number | null;
  /**
   * « Contrôlé sur 96, compte actuel 120 — à revoir ». ⚠️ Un blocage périmé
   * RESTE bloquant : seul un nouveau verdict le lève.
   */
  readonly stale: boolean;
}

/** La pastille d'une commande colisée. */
export interface QualityOrderStatus {
  readonly orderId: string;
  /** `null` si la commande n'est plus au plan de la journée. */
  readonly reference: string | null;
  readonly verdict: QualityVerdictCode;
  readonly checkedAt: string;
}

/** Les pastilles d'une journée — lisibles en `read` (D3, D7). */
export interface QualityBoardView {
  readonly date: string;
  readonly lines: readonly QualityLineStatus[];
  readonly orders: readonly QualityOrderStatus[];
  /** Les commandes retenues au retrait par un blocage courant (D4, D6), triées. */
  readonly heldOrderIds: readonly string[];
}

/** Une photo jointe, sans ses octets : ils se lisent par sa route, en `write`. */
export interface QualityPhotoView {
  readonly position: number;
  readonly contentType: string;
  readonly byteSize: number;
}

export type QualityCheckTargetView =
  | { readonly kind: "line"; readonly sku: string; readonly quantitySeen: number }
  | { readonly kind: "order"; readonly orderId: string };

/** Un verdict rendu, en entier — servi en `write` seulement (D3). */
export interface QualityCheckView {
  readonly id: string;
  readonly target: QualityCheckTargetView;
  readonly verdict: QualityVerdictCode;
  readonly note: string | null;
  /** La fiche staff qui a jugé. */
  readonly checkedBy: string;
  /** « Prénom Nom » de cette fiche, ou `null` : l'écran affiche alors l'identifiant. */
  readonly checkedByName: string | null;
  readonly checkedAt: string;
  readonly photos: readonly QualityPhotoView[];
}

/** L'historique des verdicts d'une journée, du plus récent au plus ancien. */
export interface QualityChecksView {
  readonly date: string;
  readonly checks: readonly QualityCheckView[];
}

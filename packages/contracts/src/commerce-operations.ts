import { z } from "zod";

/**
 * ── Les opérations datées, tenues AU COMMERCE ────────────────────────────────
 *
 * Noël, Pâques, la galette : le commerce devient la source de ses opérations
 * (`documentation/operations-datees/plan-l-operation-passe-au-commerce.md`,
 * O1, lot 1). Ce contrat ne valide que la **forme** : la clé, l'ordre des
 * cinq dates, un jour qui existe, une sélection sans doublon sont tenus par
 * l'agrégat `Operation` du commerce.
 *
 * Routes (surface `lfc_operations`) — **FERMÉES** tant que l'interrupteur
 * `OPERATIONS_AT_COMMERCE` ne l'est pas : elles répondent 409
 * `operations.writing_closed`.
 *
 * - `POST /admin/operations` ← `PrepareCommerceOperationPayload` → `{ key }`
 * - `PUT  /admin/operations/:key/presentation` ← `EditCommerceOperationPayload`
 * - `PUT  /admin/operations/:key/schedule` ← `RescheduleCommerceOperationPayload`
 * - `PUT  /admin/operations/:key/audience` ← `SetCommerceOperationAudiencePayload`
 * - `PUT  /admin/operations/:key/visibility` ← `SetCommerceOperationVisibilityPayload`
 * - `PUT  /admin/operations/:key/selection` ← `SetCommerceOperationSelectionPayload`
 * - `PUT  /admin/operations/:key/archive` → `{ key }`
 */

/** Les trois clientèles d'une opération (D7). */
export const COMMERCE_OPERATION_AUDIENCES = ["pro", "public", "both"] as const;
export type CommerceOperationAudience = (typeof COMMERCE_OPERATION_AUDIENCES)[number];

/** Un texte d'annonce : le français toujours, l'anglais et l'italien s'il y en a. */
export const commerceOperationTextSchema = z.strictObject({
  fr: z.string(),
  en: z.string().optional(),
  it: z.string().optional(),
});

/**
 * L'image : une URL et son texte alternatif. Au lot 1, l'URL n'est pas
 * encore choisie dans la médiathèque — c'est le lot 2 (O3).
 */
export const commerceOperationImageSchema = z.strictObject({
  url: z.string(),
  alt: z.string(),
});

/** Un instant ISO **avec** son décalage : un instant sans fuseau ne dit pas quand. */
const instantSchema = z.iso.datetime({ offset: true });

/**
 * Les cinq dates (D2) : trois instants, deux JOURS de retrait `AAAA-MM-JJ`.
 * `orderFrom` à `null` = on commande dès l'annonce.
 */
export const commerceOperationScheduleSchema = z.strictObject({
  announceFrom: instantSchema,
  orderFrom: instantSchema.nullable(),
  orderUntil: instantSchema,
  pickupFrom: z.string(),
  pickupUntil: z.string(),
});
export type RescheduleCommerceOperationPayload = z.infer<typeof commerceOperationScheduleSchema>;
export const rescheduleCommerceOperationPayloadSchema = commerceOperationScheduleSchema;

/** Préparer : la clé, choisie par le staff, ne change plus jamais. La sélection commence vide. */
export const prepareCommerceOperationPayloadSchema = commerceOperationScheduleSchema.extend({
  key: z.string(),
  name: commerceOperationTextSchema,
  lede: commerceOperationTextSchema.nullable(),
  image: commerceOperationImageSchema.nullable(),
  audience: z.enum(COMMERCE_OPERATION_AUDIENCES),
});
export type PrepareCommerceOperationPayload = z.infer<typeof prepareCommerceOperationPayloadSchema>;

/** Le nom, l'accroche et l'image — ce que l'annonce affiche. */
export const editCommerceOperationPayloadSchema = z.strictObject({
  name: commerceOperationTextSchema,
  lede: commerceOperationTextSchema.nullable(),
  image: commerceOperationImageSchema.nullable(),
});
export type EditCommerceOperationPayload = z.infer<typeof editCommerceOperationPayloadSchema>;

export const setCommerceOperationAudiencePayloadSchema = z.strictObject({
  audience: z.enum(COMMERCE_OPERATION_AUDIENCES),
});
export type SetCommerceOperationAudiencePayload = z.infer<
  typeof setCommerceOperationAudiencePayloadSchema
>;

/** Masquer (`true`) ou afficher : réversible, et distinct de l'archivage. */
export const setCommerceOperationVisibilityPayloadSchema = z.strictObject({
  hidden: z.boolean(),
});
export type SetCommerceOperationVisibilityPayload = z.infer<
  typeof setCommerceOperationVisibilityPayloadSchema
>;

/** La sélection ENTIÈRE, dans l'ordre du rayon. Une liste vide vide la sélection. */
export const setCommerceOperationSelectionPayloadSchema = z.strictObject({
  skus: z.array(z.string()),
});
export type SetCommerceOperationSelectionPayload = z.infer<
  typeof setCommerceOperationSelectionPayloadSchema
>;

/** Ce qu'une écriture rend : la clé, qui est l'identité. */
export interface CommerceOperationKeyResponse {
  readonly key: string;
}

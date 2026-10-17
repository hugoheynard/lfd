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
 * Routes (surface `lfc_operations`) :
 *
 * - `POST /admin/operations` ← `PrepareCommerceOperationPayload` → `{ key }`
 * - `PUT  /admin/operations/:key/presentation` ← `EditCommerceOperationPayload`
 * - `PUT  /admin/operations/:key/schedule` ← `RescheduleCommerceOperationPayload`
 * - `PUT  /admin/operations/:key/audience` ← `SetCommerceOperationAudiencePayload`
 * - `PUT  /admin/operations/:key/visibility` ← `SetCommerceOperationVisibilityPayload`
 * - `PUT  /admin/operations/:key/selection` ← `SetCommerceOperationSelectionPayload`
 * - `PUT  /admin/operations/:key/archive` → `{ key }`
 *
 * Lectures (lot 3, `lfc_operations:read`) :
 *
 * - `GET  /admin/operations` → `CommerceOperationView[]` (archivées comprises)
 * - `GET  /admin/operations/:key` → `CommerceOperationView`
 *
 * La migration depuis le référentiel (lot 3, `lfc_operations:write`), en deux
 * temps — utilisable interrupteur OUVERT seulement :
 *
 * - `GET  /admin/operations/migration` → `OperationsMigrationReport` (l'aperçu)
 * - `POST /admin/operations/migration` → `OperationsMigrationReport` (le relevé APRÈS)
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
 * L'image : une image de la médiathèque, par son adresse (lot 2, O3).
 *
 * `alt` est **ignoré** depuis le lot 3 (Hugo, 2026-10-16) : le texte
 * alternatif est celui de la médiathèque, relu à chaque lecture. Il reste
 * accepté pour ne pas refuser un écran qui l'enverrait encore.
 */
export const commerceOperationImageSchema = z.strictObject({
  url: z.string(),
  alt: z.string().optional(),
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

/**
 * Le calendrier : les cinq dates, et `showsOrderUntilTime` — la boutique dit
 * « avant le 21 décembre à 12:00 » (`true`) ou « avant le 21 décembre »
 * (`false`). Absent = `true` : un écran d'avant le réglage (2026-10-16) n'est
 * ni refusé, ni ne l'éteint. Une opération préparée l'affiche toujours.
 */
export const rescheduleCommerceOperationPayloadSchema = commerceOperationScheduleSchema.extend({
  showsOrderUntilTime: z.boolean().optional(),
});
export type RescheduleCommerceOperationPayload = z.infer<
  typeof rescheduleCommerceOperationPayloadSchema
>;

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

/**
 * L'état d'une opération à l'horloge du serveur (D2) : avant l'annonce,
 * annoncée, commandes ouvertes, commandes closes (retraits à venir), finie.
 */
export type CommerceOperationState = "preparing" | "announced" | "open" | "closed" | "ended";

/**
 * Ce que la boutique montre de l'opération **maintenant** (plan, « Une
 * opération sans article ») :
 *
 * - `nothing` — rien (masquée, archivée, pas encore annoncée, finie, ou
 *   commandes closes sans article vendu) ;
 * - `announcement_only` — l'encart seul, sans produit (« En boutique :
 *   l'annonce seule, sans produit ») ;
 * - `announcement_and_products` — l'encart, puis les articles.
 */
export type CommerceOperationShopDisplay =
  "nothing" | "announcement_only" | "announcement_and_products";

/** Une opération du commerce, telle que l'écran « Opérations » la lit. */
export interface CommerceOperationView {
  readonly key: string;
  readonly name: { readonly fr: string; readonly en?: string; readonly it?: string };
  /** Le chapeau — le texte de l'encart. */
  readonly lede: { readonly fr: string; readonly en?: string; readonly it?: string } | null;
  /**
   * `alt` : le texte alternatif de la MÉDIATHÈQUE (`''` si personne ne l'a
   * écrit, ou si l'image n'y est plus) ; `focal` : son point, `null` = centre.
   */
  readonly image: {
    readonly url: string;
    readonly alt: string;
    readonly focal: { readonly x: number; readonly y: number } | null;
  } | null;
  /** Instants ISO. `orderFrom` à `null` = on commande dès l'annonce. */
  readonly announceFrom: string;
  readonly orderFrom: string | null;
  readonly orderUntil: string;
  /** Jours `AAAA-MM-JJ`. */
  readonly pickupFrom: string;
  readonly pickupUntil: string;
  /**
   * La boutique affiche l'HEURE de clôture (« avant le 21 décembre à 12:00 »),
   * pas seulement le jour. Vrai à la préparation ; réglé avec le calendrier.
   */
  readonly showsOrderUntilTime: boolean;
  readonly audience: CommerceOperationAudience;
  /** La sélection, dans l'ordre du rayon. */
  readonly skus: readonly string[];
  /** Ceux de la sélection qui sont en vente (servis à une boutique au moins). */
  readonly sellingSkus: readonly string[];
  /** Aucun article de la sélection n'est en vente — vide, ou rien de servi. */
  readonly withoutSellingArticle: boolean;
  readonly hidden: boolean;
  readonly archivedAt: string | null;
  readonly state: CommerceOperationState;
  readonly shopDisplay: CommerceOperationShopDisplay;
  /** Commandes ouvertes et aucun article vendu : l'encart dit « Les produits arrivent bientôt ». */
  readonly awaitingProducts: boolean;
  /**
   * `false` : une copie reçue du référentiel que la migration n'a pas encore
   * reprise — elle ne s'écrit pas avant (409 `operations.awaiting_migration`).
   */
  readonly heldAtCommerce: boolean;
  /** Qui l'a écrite en dernier au commerce (`StaffUser.id`), et quand. */
  readonly lastWrite: { readonly by: string | null; readonly at: string } | null;
}

/** Les champs que la migration compare, un par un. */
export type OperationMigrationFieldName =
  | "name"
  | "lede"
  | "image"
  | "announceFrom"
  | "orderFrom"
  | "orderUntil"
  | "pickupFrom"
  | "pickupUntil"
  | "audience"
  | "skus"
  | "hidden"
  | "archived";

/**
 * Pourquoi le résultat diffère de ce que la boutique appliquait (le miroir,
 * surcharge combinée) :
 *
 * - `same` — il ne diffère pas ;
 * - `referential_newer` — le référentiel a changé depuis le dernier envoi ;
 * - `not_in_mirror` — l'opération n'a jamais été envoyée ;
 * - `held_at_commerce` — non comparé : le commerce la tient déjà (écrite
 *   par la migration ou depuis), la migration ne la touche plus ;
 * - `unexplained` — rien ne l'explique : **bloque** l'application.
 */
export type OperationMigrationExplanation =
  "same" | "referential_newer" | "not_in_mirror" | "held_at_commerce" | "unexplained";

/** Un champ, aux trois endroits — valeurs rendues en texte (ISO, `AAAA-MM-JJ`, SKU séparés par `, `). */
export interface OperationMigrationFieldView {
  readonly field: OperationMigrationFieldName;
  /** Ce que dit le référentiel, la source de la migration ; `null` = absente du référentiel. */
  readonly referential: string | null;
  /** Ce que la boutique appliquait (miroir + surcharge) ; `null` = absente du miroir. */
  readonly mirror: string | null;
  /** Ce que le commerce tiendra. */
  readonly result: string;
  /** `true` : la surcharge de la réception l'a restreint. */
  readonly restricted: boolean;
  readonly explanation: OperationMigrationExplanation;
}

/**
 * Ce que la migration fait d'une opération :
 *
 * - `create` — au référentiel, jamais envoyée : écrite au commerce ;
 * - `adopt` — copie reçue, reprise avec les valeurs du référentiel restreintes ;
 * - `already_at_commerce` — déjà écrite au commerce : laissée telle quelle
 *   (c'est ce qui rend l'application rejouable) ;
 * - `archived_unchanged` — retirée des deux côtés : figée ;
 * - `mirror_only` — au miroir, absente du référentiel : listée, pas inventée ;
 * - `blocked` — un problème l'empêche (`problems`) : l'application refuse tout.
 */
export type OperationMigrationOutcome =
  "create" | "adopt" | "already_at_commerce" | "archived_unchanged" | "mirror_only" | "blocked";

/** Ce que la réception avait décidé — versé dans l'opération, tracé au journal. */
export interface OperationMigrationRestrictionView {
  readonly isHidden: boolean;
  readonly orderUntil: string | null;
  readonly audience: CommerceOperationAudience | null;
  readonly hiddenSkus: readonly string[];
  readonly decidedBy: string | null;
  readonly decidedAt: string;
}

/** Une opération dans l'aperçu ou le relevé. */
export interface OperationMigrationLineView {
  readonly key: string;
  /** Le nom français, la clé à défaut. */
  readonly name: string;
  readonly outcome: OperationMigrationOutcome;
  readonly fields: readonly OperationMigrationFieldView[];
  /** Les SKU de la sélection que le commerce ne connaît pas — écartés, comme le push le faisait. */
  readonly droppedSkus: readonly string[];
  readonly restriction: OperationMigrationRestrictionView | null;
  /** Ce qui bloque, en clair. Vide sauf `blocked`. */
  readonly problems: readonly string[];
}

/** L'aperçu (avant) ou le relevé (après) de la migration des opérations. */
export interface OperationsMigrationReport {
  /** Instant ISO de la lecture. */
  readonly readAt: string;
  readonly counts: {
    readonly referential: number;
    readonly mirror: number;
    /** Surcharges qui restreignent quelque chose. */
    readonly restrictions: number;
    /** `create` + `adopt` : ce qu'une application écrirait. */
    readonly toWrite: number;
    readonly alreadyAtCommerce: number;
    readonly mirrorOnly: number;
    readonly blocked: number;
  };
  /** `true` : au moins une ligne `blocked` — l'application refuse (409). */
  readonly blocked: boolean;
  readonly operations: readonly OperationMigrationLineView[];
}

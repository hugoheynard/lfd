import { z } from "zod";

import type { ContentLocale } from "./platform-content.js";
import type { ShopItemView, ShopOperationView, ShopShelfView } from "./shop-catalogue.js";

/**
 * ── Le webhook de la VITRINE ─────────────────────────────────────────────────
 *
 * L'agence web qui fait le site vitrine est prévenue quand le catalogue publié
 * change, puis relit (`documentation/webhooks/vitrine.md`,
 * décisions de Hugo du 2026-10-18). Ce contrat ne valide que la **forme** :
 * l'URL https sans requête, le nom borné et les cases connues sont tenus par
 * l'agrégat `VitrineSubscriber` du commerce.
 *
 * Routes de l'agence (en-tête `X-Vitrine-Key`, la clé de lecture) :
 *
 * - `GET /vitrine/catalogue?lang=fr|en|it` → `VitrineCatalogueView`
 * - `GET /vitrine/articles/:sku?lang=` → `VitrineItemView`
 * - `GET /vitrine/textes?lang=` → `VitrineTextsView`
 *
 * Routes du back-office (surface `lfd_webhooks`) :
 *
 * - `GET  /admin/vitrine/subscribers` → `VitrineSubscriberView[]`
 * - `POST /admin/vitrine/subscribers` ← `CreateVitrineSubscriberPayload` → `VitrineCredentialsView`
 * - `PUT  /admin/vitrine/subscribers/:id/identity` ← `UpdateVitrineSubscriberIdentityPayload`
 * - `PUT  /admin/vitrine/subscribers/:id/contents` ← `SetVitrineContentsPayload`
 * - `PUT  /admin/vitrine/subscribers/:id/active` ← `SetVitrineSubscriberActivePayload`
 * - `POST /admin/vitrine/subscribers/:id/rotate` → `VitrineCredentialsView`
 * - `POST /admin/vitrine/subscribers/:id/resync` (« tout renvoyer »)
 * - `POST /admin/vitrine/subscribers/:id/test` → `{ id }` (« Envoyer un test »)
 * - `GET  /admin/vitrine/subscribers/:id/deliveries` → `VitrineDeliveryView[]`
 * - `POST /admin/vitrine/deliveries/:id/resend` (« renvoyer »)
 * - `POST /admin/vitrine/notices/preview` ← `VitrineNoticeDraftPayload` → `VitrineNoticePreviewView`
 * - `POST /admin/vitrine/notices` ← `SendVitrineNoticePayload` → `VitrineNoticeSentView` (« Notifier les abonnés »)
 * - `GET  /admin/vitrine/notices` → `VitrineNoticeView[]` (les dernières annonces)
 * - `POST /admin/vitrine/notices/:id/resume` (« Reprendre l'envoi » : les destinataires pas encore tentés)
 */

/**
 * Les ensembles qu'un abonné reçoit. Une case ne fait que RETIRER : aucune ne
 * peut élargir la vue publique (W1). `featured` = la mise en avant publique
 * (« Incontournables ») : sans elle, `isFeatured` ne sort pas.
 */
export const vitrineContents = ["catalogue", "operations", "texts", "featured"] as const;
export type VitrineContent = (typeof vitrineContents)[number];

/** Le nom de l'en-tête qui porte la clé de lecture de l'agence. */
export const VITRINE_KEY_HEADER = "x-vitrine-key";
/** L'en-tête de signature d'une livraison : `t=<secondes>,v1=<hex>`. */
export const VITRINE_SIGNATURE_HEADER = "vitrine-signature";
/** L'en-tête qui porte l'identifiant d'envoi : stable d'un essai à l'autre, neuf quand la livraison absorbe d'autres changements. */
export const VITRINE_DELIVERY_HEADER = "vitrine-delivery";

/**
 * Un article tel que la vitrine le reçoit : celui de la boutique, dont
 * `isFeatured` n'est présent que si l'abonné reçoit les « Incontournables »,
 * et `operation` que s'il reçoit les opérations.
 */
export type VitrineItemView = Omit<ShopItemView, "isFeatured" | "operation"> & {
  readonly isFeatured?: boolean;
  readonly operation?: ShopItemView["operation"];
};

/** La vue de l'agence, dans une langue. Un ensemble décoché est vide. */
export interface VitrineCatalogueView {
  readonly language: ContentLocale;
  readonly shelves: readonly ShopShelfView[];
  readonly items: readonly VitrineItemView[];
  readonly operations: readonly ShopOperationView[];
}

/** Les textes EFFECTIFS de la boutique : le publié s'il existe, sinon le texte du code. */
export interface VitrineTextsView {
  readonly language: ContentLocale;
  readonly texts: Readonly<Record<string, string>>;
}

/** Les identifiants d'éléments, par ensemble. */
export interface VitrineElementKeys {
  readonly items: readonly string[];
  readonly operations: readonly string[];
  readonly shelves: readonly string[];
  readonly texts: readonly string[];
}

/**
 * Le corps d'une livraison — un SIGNAL, pas le contenu : l'agence relit.
 * `sequence` croît par abonné ; un essai (« Envoyer un test ») porte
 * `sequence: 0` et `test: true`.
 */
export interface VitrineNotification {
  readonly subscriber: string;
  readonly sequence: number;
  readonly at: string;
  readonly test?: true;
  readonly changed: VitrineElementKeys;
  readonly removed: VitrineElementKeys;
}

/** `failing` : une livraison a épuisé ses essais, plus rien ne part. */
export type VitrineSubscriberState = "active" | "inactive" | "failing";

export interface VitrineSubscriberView {
  readonly id: string;
  readonly name: string;
  /** Pour le staff : à quoi sert l'abonné. Jamais envoyée à l'agence. */
  readonly description: string | null;
  /** L'adresse où écrire à l'agence. Peut être nominative : jamais servie à l'agence. */
  readonly contactEmail: string | null;
  /**
   * `null` : abonné en LECTURE SEULE (2026-10-20) — il lit `/vitrine/*` avec
   * sa clé, aucun webhook ne lui part.
   */
  readonly endpointUrl: string | null;
  readonly contents: readonly VitrineContent[];
  readonly state: VitrineSubscriberState;
  readonly failedAt: string | null;
  readonly lastSequence: number;
  readonly createdAt: string;
}

/** Montré UNE fois, à la création ou à la rotation : ni l'un ni l'autre ne se relit. */
export interface VitrineCredentialsView {
  readonly id: string;
  readonly signingSecret: string;
  readonly readKey: string;
}

export type VitrineDeliveryState = "pending" | "delivered" | "failed";
export type VitrineDeliveryKind = "change" | "test";

export interface VitrineDeliveryView {
  readonly id: string;
  /**
   * L'identifiant d'ENVOI — celui de l'en-tête `Vitrine-Delivery` que
   * l'agence a reçu : stable d'un essai à l'autre, neuf quand la livraison a
   * absorbé d'autres changements. C'est lui qu'on lui cite pour rapprocher.
   */
  readonly dispatchId: string;
  readonly kind: VitrineDeliveryKind;
  readonly sequence: number | null;
  readonly state: VitrineDeliveryState;
  readonly attempts: number;
  readonly nextAttemptAt: string | null;
  readonly lastError: string | null;
  readonly lastStatus: number | null;
  readonly changed: VitrineElementKeys;
  readonly removed: VitrineElementKeys;
  readonly createdAt: string;
  readonly deliveredAt: string | null;
}

const vitrineContentsSchema = z.array(z.enum(vitrineContents)).max(vitrineContents.length);

export const createVitrineSubscriberPayloadSchema = z.strictObject({
  name: z.string(),
  /** Absente, `null` ou vide : pas d'adresse, l'abonné lit seulement le flux. */
  endpointUrl: z.string().nullable().optional(),
  contents: vitrineContentsSchema,
  description: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
});
export type CreateVitrineSubscriberPayload = z.infer<typeof createVitrineSubscriberPayloadSchema>;

/** Le nom, la description et le contact ; vide ou `null` efface les deux derniers. */
export const updateVitrineSubscriberIdentityPayloadSchema = z.strictObject({
  name: z.string(),
  description: z.string().nullable(),
  contactEmail: z.string().nullable(),
});
export type UpdateVitrineSubscriberIdentityPayload = z.infer<
  typeof updateVitrineSubscriberIdentityPayloadSchema
>;

export const setVitrineContentsPayloadSchema = z.strictObject({
  contents: vitrineContentsSchema,
});
export type SetVitrineContentsPayload = z.infer<typeof setVitrineContentsPayloadSchema>;

export const setVitrineSubscriberActivePayloadSchema = z.strictObject({ active: z.boolean() });
export type SetVitrineSubscriberActivePayload = z.infer<
  typeof setVitrineSubscriberActivePayloadSchema
>;

// ── Les annonces aux abonnés (e-mail, Hugo 2026-10-18) ────────────────────────

/** Les bornes, répétées pour l'écran ; l'agrégat `VitrineNotice` les tient. */
export const VITRINE_NOTICE_SUBJECT_MAX_LENGTH = 150;
export const VITRINE_NOTICE_MESSAGE_MAX_LENGTH = 5000;

/**
 * Le brouillon d'une annonce. `subscriberIds` `null` = tous les abonnés qui ont
 * un contact ; sinon la sélection.
 */
export const vitrineNoticeDraftPayloadSchema = z.strictObject({
  subject: z.string(),
  message: z.string(),
  subscriberIds: z.array(z.string()).nullable(),
});
export type VitrineNoticeDraftPayload = z.infer<typeof vitrineNoticeDraftPayloadSchema>;

/**
 * L'envoi : le brouillon relu, et une clé d'idempotence tirée par l'écran à
 * l'ouverture de l'aperçu — un double clic retrouve la même annonce.
 */
export const sendVitrineNoticePayloadSchema = vitrineNoticeDraftPayloadSchema.extend({
  idempotencyKey: z.string().uuid("clé d'idempotence attendue (UUID)"),
});
export type SendVitrineNoticePayload = z.infer<typeof sendVitrineNoticePayloadSchema>;

/** L'annonce envoyée — ou celle qu'un premier clic avait déjà envoyée. */
export interface VitrineNoticeSentView {
  readonly id: string;
}

export interface VitrineNoticeAddresseeView {
  readonly subscriberId: string;
  readonly name: string;
  readonly contactEmail: string;
}

/** L'e-mail tel qu'il partira, et à qui. Rien n'est écrit. */
export interface VitrineNoticePreviewView {
  readonly subject: string;
  readonly html: string;
  readonly recipients: readonly VitrineNoticeAddresseeView[];
}

export interface VitrineNoticeRecipientView {
  readonly subscriberId: string;
  /** Le nom de l'abonné AUJOURD'HUI ; l'adresse, elle, est celle de l'envoi. */
  readonly subscriberName: string;
  readonly contactEmail: string;
  /**
   * `true` : le fournisseur a ACCEPTÉ l'e-mail — pas qu'il est arrivé.
   * `false` : refusé, ou mailer à blanc. `null` : pas encore tenté.
   */
  readonly mailSent: boolean | null;
  readonly attemptedAt: string | null;
}

export interface VitrineNoticeView {
  readonly id: string;
  /** L'id du membre du staff qui l'a envoyée. */
  readonly authorStaffId: string;
  /**
   * « Prénom Nom » lu dans l'annuaire à la LECTURE (jamais recopié en base) ;
   * `null` si l'id ne désigne plus personne — l'écran montre alors l'id.
   */
  readonly authorName: string | null;
  readonly subject: string;
  readonly message: string;
  readonly createdAt: string;
  readonly recipients: readonly VitrineNoticeRecipientView[];
}

import { z } from "zod";

import type { ContentLocale } from "./platform-content.js";
import type { ShopItemView, ShopOperationView, ShopShelfView } from "./shop-catalogue.js";

/**
 * ── Le webhook de la VITRINE ─────────────────────────────────────────────────
 *
 * L'agence web qui fait le site vitrine est prévenue quand le catalogue publié
 * change, puis relit (`documentation/webhooks/plan-webhook-vitrine.md`, lot W,
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
 * Routes du back-office (surface `shop_vitrine`) :
 *
 * - `GET  /admin/vitrine/subscribers` → `VitrineSubscriberView[]`
 * - `POST /admin/vitrine/subscribers` ← `CreateVitrineSubscriberPayload` → `VitrineCredentialsView`
 * - `PUT  /admin/vitrine/subscribers/:id/contents` ← `SetVitrineContentsPayload`
 * - `PUT  /admin/vitrine/subscribers/:id/active` ← `SetVitrineSubscriberActivePayload`
 * - `POST /admin/vitrine/subscribers/:id/rotate` → `VitrineCredentialsView`
 * - `POST /admin/vitrine/subscribers/:id/resync` (« tout renvoyer »)
 * - `POST /admin/vitrine/subscribers/:id/test` → `{ id }` (« Envoyer un test »)
 * - `GET  /admin/vitrine/subscribers/:id/deliveries` → `VitrineDeliveryView[]`
 * - `POST /admin/vitrine/deliveries/:id/resend` (« renvoyer »)
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
/** L'en-tête qui porte l'id de la livraison — stable d'un essai à l'autre. */
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
  readonly endpointUrl: string;
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
  endpointUrl: z.string(),
  contents: vitrineContentsSchema,
});
export type CreateVitrineSubscriberPayload = z.infer<typeof createVitrineSubscriberPayloadSchema>;

export const setVitrineContentsPayloadSchema = z.strictObject({
  contents: vitrineContentsSchema,
});
export type SetVitrineContentsPayload = z.infer<typeof setVitrineContentsPayloadSchema>;

export const setVitrineSubscriberActivePayloadSchema = z.strictObject({ active: z.boolean() });
export type SetVitrineSubscriberActivePayload = z.infer<
  typeof setVitrineSubscriberActivePayloadSchema
>;

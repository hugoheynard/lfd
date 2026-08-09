import { z } from "zod";

import { billingAddressPayloadSchema, type BillingAddressPayload } from "./address.js";
import { fulfillmentMethodSchema, type FulfillmentMethod } from "./order.js";

/**
 * **Panier récurrent** (abonnement) — un gabarit de commande qui se répète. Il ne
 * déclenche pas encore de commande (le planificateur viendra plus tard) ; on
 * capture ici l'intention : quelles lignes, à quel rythme, entre quelles dates,
 * comment l'acheminer et la régler.
 *
 * Périmètre tranché : **paiement carte** (pas de sélecteur de terme) et, en
 * livraison, une **adresse libre** figée (comme le coursier zéro friction).
 */

/** Rythme de récurrence. */
export const recurrenceSchema = z.enum(["weekly", "biweekly", "monthly"]);
export type Recurrence = z.infer<typeof recurrenceSchema>;

/** État d'un abonnement. */
export const subscriptionStatusSchema = z.enum(["active", "paused"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** Change l'état d'un panier récurrent (mettre en pause / reprendre). */
export const setSubscriptionStatusPayloadSchema = z.object({
  status: subscriptionStatusSchema,
});
export type SetSubscriptionStatusPayload = z.infer<typeof setSubscriptionStatusPayloadSchema>;

/** Une ligne du gabarit : SKU + quantité (le prix est ré-résolu à l'échéance). */
const subscriptionLinePayloadSchema = z.object({
  sku: z.string().min(1),
  quantity: z.number().int().positive(),
});

/**
 * Création d'un panier récurrent — le plus souvent **depuis une commande**
 * (`fromOrderId`), dont on reprend les lignes. Dates `AAAA-MM-JJ` ; `endDate`
 * `null` = sans fin. En livraison, `deliveryAddress` requis ; en retrait,
 * `pickupAddressId` (ou `null` = point par défaut).
 */
export const createSubscriptionPayloadSchema = z
  .object({
    fromOrderId: z.string().nullable().default(null),
    recurrence: recurrenceSchema,
    startDate: z.string().min(1),
    endDate: z.string().nullable().default(null),
    fulfillmentMethod: fulfillmentMethodSchema,
    deliveryAddress: billingAddressPayloadSchema.nullable().default(null),
    pickupAddressId: z.string().nullable().default(null),
    lines: z.array(subscriptionLinePayloadSchema).min(1, "au moins une ligne"),
    note: z.string().default(""),
  })
  .refine(
    (payload) => payload.fulfillmentMethod !== "delivery" || payload.deliveryAddress !== null,
    { message: "adresse de livraison requise", path: ["deliveryAddress"] },
  )
  .refine((payload) => payload.endDate === null || payload.endDate >= payload.startDate, {
    message: "la date de fin doit suivre la date de début",
    path: ["endDate"],
  });
export type CreateSubscriptionPayload = z.infer<typeof createSubscriptionPayloadSchema>;

/** `AAAA-MM-JJ` — la date d'une échéance visée par une dérogation. */
export const occurrenceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ");

/**
 * Dérogation d'une **échéance précise** (« modifier cette commande uniquement »).
 * Deux cas : soit on **saute** l'échéance (`skipped`), soit on **remplace** ses
 * lignes pour cette date-là seulement. La date n'est pas dans le corps : elle est
 * portée par l'URL (`PUT /subscriptions/:id/occurrences/:date`).
 */
export const upsertOccurrenceOverridePayloadSchema = z
  .object({
    skipped: z.boolean().default(false),
    lines: z.array(subscriptionLinePayloadSchema).default([]),
    note: z.string().default(""),
  })
  .refine((payload) => payload.skipped || payload.lines.length >= 1, {
    message: "au moins une ligne si l'échéance n'est pas sautée",
    path: ["lines"],
  });
export type UpsertOccurrenceOverridePayload = z.infer<typeof upsertOccurrenceOverridePayloadSchema>;

/** Une échéance dérogée, telle que renvoyée avec l'abonnement. */
export interface OccurrenceOverrideView {
  /** `AAAA-MM-JJ` — l'échéance visée. */
  readonly date: string;
  /** Échéance sautée (aucune commande ce jour-là). */
  readonly skipped: boolean;
  /** Lignes de remplacement (vide si sautée). */
  readonly lines: readonly SubscriptionLineView[];
  readonly note: string;
}

/** Une ligne d'abonnement telle que renvoyée (SKU + quantité). */
export interface SubscriptionLineView {
  readonly sku: string;
  readonly quantity: number;
}

/** Un panier récurrent, tel que la liste l'affiche. */
export interface SubscriptionView {
  readonly id: string;
  readonly recurrence: Recurrence;
  readonly status: SubscriptionStatus;
  /** `AAAA-MM-JJ`. */
  readonly startDate: string;
  /** `AAAA-MM-JJ` ou `null` (sans fin). */
  readonly endDate: string | null;
  readonly fulfillmentMethod: FulfillmentMethod;
  /** Adresse de livraison **libre figée** (livraison), ou `null` (retrait). */
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly note: string;
  readonly lines: readonly SubscriptionLineView[];
  /** Dérogations par échéance (sautée / lignes remplacées). */
  readonly overrides: readonly OccurrenceOverrideView[];
  /** ISO — créé le. */
  readonly createdAt: string;
}

import { z } from "zod";

import {
  billingAddressPayloadSchema,
  fulfillmentWindowSchema,
  type BillingAddressPayload,
  type FulfillmentWindow,
} from "./address.js";
import { fulfillmentMethodSchema, type FulfillmentMethod } from "./order.js";

/**
 * **Panier récurrent** (abonnement) — un gabarit de commande qui se répète :
 * quelles lignes, à quel rythme, entre quelles dates, comment l'acheminer et
 * dans quel créneau. Le planificateur en passe une commande à chaque échéance
 * (`documentation/commandes/paniers-recurrents/plan-planificateur.md`).
 *
 * En livraison, l'adresse est **libre** et figée, comme le coursier zéro
 * friction.
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
    /**
     * Le créneau de chaque échéance — obligatoire, comme pour toute commande
     * (décision de Hugo du 2026-10-14 : pas de commande sans créneau ; repris
     * pour le panier le 2026-11-24).
     */
    requestedWindow: fulfillmentWindowSchema,
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
  /** Le créneau de chaque échéance ; `null` pour un panier ouvert avant qu'il soit demandé. */
  readonly requestedWindow: FulfillmentWindow | null;
  readonly note: string;
  readonly lines: readonly SubscriptionLineView[];
  /** La version des CGV que le panier applique aujourd'hui. */
  readonly salesTerms: SubscriptionSalesTermsView;
  /** La version annoncée et sa date d'effet, `null` sans annonce en cours. */
  readonly nextSalesTerms: SubscriptionNextSalesTermsView | null;
  /**
   * Les échéances de la fenêtre utile — les quatre semaines passées et
   * toutes celles déjà créées à l'avance —, triées par jour. Un panier sans
   * société n'en a aucune.
   */
  readonly occurrences: readonly RecurringOccurrenceView[];
  /** ISO — créé le. */
  readonly createdAt: string;
}

/**
 * Un panier récurrent **vu du back-office**.
 *
 * Deux champs de plus, et ils disent la même chose : **à qui il appartient**. Un
 * abonnement est porté par une personne, pas par une société — le compte en
 * regroupe donc plusieurs, et la liste staff serait illisible sans dire lequel
 * est celui de qui.
 */
export interface AdminSubscriptionRow extends SubscriptionView {
  readonly occurrences: readonly AdminRecurringOccurrenceView[];
  readonly placedByUserId: string;
  /** Nom d'usage du client, ou son e-mail quand il n'a pas encore de nom. */
  readonly placedByName: string;
}

/** L'état d'une échéance (`plan-bloc-recurrent.md`, § 5). */
export const recurringOccurrenceStateSchema = z.enum([
  "planned",
  "skipped",
  "placed",
  "refused",
  "missed",
  "cancelled",
]);
export type RecurringOccurrenceState = z.infer<typeof recurringOccurrenceStateSchema>;

/** Pourquoi une échéance n'a pas été passée — un code stable, lu par le staff. */
export const recurringOccurrenceCauseSchema = z.enum([
  "buyer_left",
  "deadline_closed",
  "item_limit_exceeded",
  "reserved_elsewhere",
  "unavailable_sku",
  "day_closed",
  "plan_closed",
  "no_settlement",
  "shop_closed",
  "order_refused",
]);
export type RecurringOccurrenceCause = z.infer<typeof recurringOccurrenceCauseSchema>;

/** La version des CGV qu'un panier applique : le document et sa révision. */
export interface SubscriptionSalesTermsView {
  /** Le nom du document (`salesTermsPro`, `salesTerms`). */
  readonly document: string;
  readonly revision: number;
}

/** Une version des CGV annoncée au panier, qui s'appliquera à partir de `effectiveOn`. */
export interface SubscriptionNextSalesTermsView {
  readonly revision: number;
  /** `AAAA-MM-JJ` — premier jour de service auquel elle s'applique. */
  readonly effectiveOn: string;
}

/**
 * **Une échéance**, vue du client. Un refus ou une échéance manquée ne
 * porte que son état : la cause et sa phrase sont écrites pour le staff.
 */
export interface RecurringOccurrenceView {
  /** `AAAA-MM-JJ` — le jour de service. */
  readonly serviceDay: string;
  readonly state: RecurringOccurrenceState;
  /** Les lignes effectives : la dérogation, sinon le gabarit. */
  readonly lines: readonly SubscriptionLineView[];
  /** Vrai quand l'échéance porte ses propres lignes. */
  readonly overridden: boolean;
  readonly note: string;
  /** La commande passée, `null` tant qu'elle ne l'est pas. */
  readonly orderId: string | null;
}

/** Une échéance vue du back-office : l'issue et sa raison en plus. */
export interface AdminRecurringOccurrenceView extends RecurringOccurrenceView {
  readonly cause: RecurringOccurrenceCause | null;
  /** La phrase du refus, pour le staff. */
  readonly reason: string | null;
  /** ISO — l'heure de l'issue (passée, refusée la dernière fois, manquée). */
  readonly settledAt: string | null;
}

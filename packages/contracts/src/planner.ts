import { z } from "zod";

import {
  billingAddressPayloadSchema,
  fulfillmentWindowSchema,
  type BillingAddressPayload,
  type FulfillmentWindow,
} from "./address.js";
import { fulfillmentMethodSchema, type FulfillmentMethod } from "./order.js";
import type { RecurringOccurrenceCause } from "./subscription.js";

/**
 * **Le planificateur de commandes des pros** — un jour, une colonne, un
 * brouillon de commande ; et les favoris de la société d'où viennent les articles
 * (`documentation/commandes/planificateur/plan-planificateur-de-commandes.md`).
 *
 * Ces schémas ne valident que la FORME : le jour passé, l'horizon, le gel et
 * la version sont jugés par l'agrégat `PlannedDay`.
 */

/** Longueur maximale d'un SKU. */
export const PLANNER_SKU_MAX_LENGTH = 64;
/** Le plus de lignes qu'une colonne porte. */
export const PLANNER_MAX_LINES = 200;

/** `AAAA-MM-JJ` — le jour d'une colonne, dans l'adresse ou la requête. */
export const plannerDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date AAAA-MM-JJ");

/** Le SKU d'une ligne de colonne. */
export const plannerSkuSchema = z.string().trim().min(1).max(PLANNER_SKU_MAX_LENGTH);

/**
 * `GET /planner?from`. Le site est l'espace société courant : un site est un
 * sous-compte, donc une société (`documentation/comptes-client/carte-des-sites.md`).
 */
export const plannerQuerySchema = z.object({
  from: plannerDaySchema,
});
export type PlannerQuery = z.infer<typeof plannerQuerySchema>;

/** L'acheminement d'une colonne : livraison (adresse) ou retrait (point), et son créneau. */
export const plannedRoutingSchema = z
  .object({
    method: fulfillmentMethodSchema,
    deliveryAddress: billingAddressPayloadSchema.nullable().default(null),
    pickupAddressId: z.string().nullable().default(null),
    window: fulfillmentWindowSchema,
  })
  .refine((routing) => routing.method !== "delivery" || routing.deliveryAddress !== null, {
    message: "adresse de livraison requise",
    path: ["deliveryAddress"],
  });
export type PlannedRoutingPayload = z.infer<typeof plannedRoutingSchema>;

const plannedLinePayloadSchema = z.object({
  sku: plannerSkuSchema,
  quantity: z.number().int().positive(),
});

/**
 * `POST /planner/columns` — ouvre une colonne vide pour un jour, sur un
 * créneau (dans `routing.window`). Un jour porte au plus une colonne par
 * créneau : redemander la même rend celle qui existe.
 */
export const openPlannedColumnPayloadSchema = z.object({
  day: plannerDaySchema,
  routing: plannedRoutingSchema,
});
export type OpenPlannedColumnPayload = z.infer<typeof openPlannedColumnPayloadSchema>;

/**
 * `PUT /planner/columns/:id` — la colonne **entière**, avec la version lue.
 * Une colonne vide est permise : elle reste un brouillon et ne se commande pas.
 */
export const putPlannedColumnPayloadSchema = z.object({
  version: z.number().int().positive(),
  routing: plannedRoutingSchema,
  lines: z.array(plannedLinePayloadSchema).max(PLANNER_MAX_LINES),
});
export type PutPlannedColumnPayload = z.infer<typeof putPlannedColumnPayloadSchema>;

/** Ce que l'ouverture rend : la colonne et sa version. */
export interface PlannedColumnOpened {
  readonly id: string;
  readonly version: number;
}

/** Ce que l'écriture d'une colonne rend : la version à renvoyer au prochain geste. */
export interface PlannedColumnWritten {
  readonly version: number;
}

/** L'état d'une colonne. */
export type PlannedColumnStatus = "draft" | "placed" | "refused" | "missed";

export interface PlannedRoutingView {
  readonly method: FulfillmentMethod;
  readonly deliveryAddress: BillingAddressPayload | null;
  readonly pickupAddressId: string | null;
  readonly window: FulfillmentWindow;
}

/** Une colonne, telle que l'écran la lit. */
export interface PlannedColumnView {
  readonly id: string;
  readonly day: string;
  readonly version: number;
  readonly status: PlannedColumnStatus;
  readonly routing: PlannedRoutingView;
  readonly lines: readonly { readonly sku: string; readonly quantity: number }[];
  /** L'instant de gel et de conversion (ISO), `null` tant qu'il n'est pas calculé. */
  readonly convertsAt: string | null;
  readonly orderId: string | null;
  readonly refusal: { readonly cause: string; readonly reason: string } | null;
}

/** Les colonnes d'un jour, par créneau. */
export interface PlannedDayView {
  readonly day: string;
  readonly columns: readonly PlannedColumnView[];
}

/**
 * **Ce que dirait la passation** d'un article un jour donné (§ 4 bis) —
 * pour une ligne de colonne (`columnId`), ou pour un favori de la société
 * ce jour-là (`columnId` à `null`) :
 * l'heure où il ferme, et ce qui le bloquerait, dans les mots du refus réel.
 * `quantityIndependent` : vrai quand le blocage tient à l'article et au jour
 * seuls — l'écran grise alors la colonne pendant un glisser.
 */
export interface PlannedLineCheckView {
  readonly sku: string;
  readonly day: string;
  readonly columnId: string | null;
  readonly closesAt: string | null;
  readonly blocking: {
    readonly cause: RecurringOccurrenceCause;
    readonly reason: string;
  } | null;
  readonly quantityIndependent: boolean;
}

/** `GET /planner` : les colonnes de la fenêtre, les favoris de la société et leur vérification. */
/**
 * `GET /planner/access` — le planificateur est-il ouvert dans l'espace de la
 * requête ? La société jugée est celle de l'espace déclaré, vérifiée par le
 * serveur : exemptée pour `orderPlanner`, ou clé ouverte pour tous. Dans
 * l'espace personnel, `false`.
 */
export interface PlannerAccessView {
  readonly open: boolean;
}

export interface PlannerView {
  readonly from: string;
  /** Le dernier jour qu'on peut préparer (aujourd'hui + l'horizon). */
  readonly lastPlannableDay: string;
  /** Les jours affichés : le jour de départ, puis ceux qui ont une colonne en brouillon. */
  readonly shownDays: readonly string[];
  readonly days: readonly PlannedDayView[];
  /** Les favoris de la société (la colonne de gauche, § 6.2), du plus récent au plus ancien. */
  readonly favorites: readonly string[];
  readonly checks: readonly PlannedLineCheckView[];
}

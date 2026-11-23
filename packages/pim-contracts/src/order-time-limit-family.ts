import { z } from "zod";

import type { OrderTimeLimitView } from "./order-time-limit.js";
import type { ExplainedOrderTimeLimit } from "./order-time-limit-resolution.js";

/**
 * Le produit qu'on exclut d'une limite de famille
 * (`POST /pim/order-time-limits/:id/exclusions`). La route qui le réintègre le
 * nomme dans son chemin.
 */
export const orderTimeLimitExclusionPayloadSchema = z.object({
  productId: z.string().trim().min(1),
});
export type OrderTimeLimitExclusionPayload = z.infer<typeof orderTimeLimitExclusionPayloadSchema>;

/** Un produit exclu, nommé par son SKU ; `null` quand la fiche ne se nomme plus. */
export interface OrderTimeLimitExclusionView {
  readonly productId: string;
  readonly label: string | null;
}

/**
 * Une ligne de l'écran des limites (`GET /pim/order-time-limits`) : la règle,
 * et ses exclusions en vigueur nommées — toujours vide pour une limite de
 * produit.
 */
export interface OrderTimeLimitListItem extends OrderTimeLimitView {
  readonly exclusions: readonly OrderTimeLimitExclusionView[];
}

/** Une famille de la lignée d'un produit, nommée. */
export interface LineageFamilyView {
  readonly id: string;
  readonly label: string | null;
}

/** Une limite en vigueur qui porte sur le produit, et si elle l'exclut. */
export interface EffectiveRuleView {
  readonly rule: OrderTimeLimitView;
  /** Une limite de famille qui exclut nommément ce produit : elle ne le vise pas. */
  readonly excludesProduct: boolean;
}

/**
 * **La limite effective d'un produit et sa provenance**
 * (`GET /pim/order-time-limits/effective/:productId`), pour la fiche produit.
 *
 * - `lineage` : ses familles, la plus proche d'abord ;
 * - `rules` : les limites en vigueur posées sur le produit ou sur une famille
 *   de sa lignée, exclusions comprises ;
 * - `explained` : la plus stricte et sa provenance, la même résolution que le
 *   commerce applique — `null` quand aucune ne le vise.
 */
export interface EffectiveOrderTimeLimitView {
  readonly productId: string;
  readonly lineage: readonly LineageFamilyView[];
  readonly rules: readonly EffectiveRuleView[];
  readonly explained: ExplainedOrderTimeLimit | null;
}

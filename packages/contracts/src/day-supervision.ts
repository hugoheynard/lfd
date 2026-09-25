import { z } from "zod";

import { fulfillmentMethodSchema, fulfillmentSourceSchema } from "./order.js";

/**
 * Contrat de fil de la **Supervision du jour** : où en est chaque commande d'une
 * date de service, entre la passation et le retrait, et lesquelles sont en
 * retard (`documentation/order/plan-supervision-du-jour.md`).
 *
 * Servi sous `b2b_supervision:read`. 🔴 **Aucun montant, aucun contact** : un
 * champ ajouté ici s'ajoute à ce que lit, de TOUS les clients du jour —
 * particuliers compris —, quelqu'un qui n'a pas forcément `b2b_orders`.
 */

/**
 * La date de service supervisée, `AAAA-MM-JJ`. **Facultative** depuis le
 * 2026-09-25 : absente, le serveur rend le jour courant de SON horloge, à
 * l'heure de Paris — l'horloge du poste n'est pas une autorité (plan §5).
 */
export const daySupervisionQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ")
    .optional(),
});
export type DaySupervisionQuery = z.infer<typeof daySupervisionQuerySchema>;

/**
 * L'étape affichée d'une commande. `in_production` couvre `confirmed` et
 * `in_production` ; `handed_over` est « retirée » ou « livrée » selon
 * l'acheminement. `cancelled` est à part, jamais en retard.
 */
export const supervisionStageSchema = z.enum([
  "placed",
  "in_production",
  "ready",
  "handed_over",
  "cancelled",
]);
export type SupervisionStage = z.infer<typeof supervisionStageSchema>;

/**
 * La règle qui signale un retard. Elles ne jugent QUE les créneaux promis — une
 * heure d'ouverture recopiée n'est pas une promesse.
 *
 * - `not_handed_over_after_window` : le créneau est passé, la commande n'est
 *   ni retirée ni livrée ;
 * - `not_ready_before_window` : le créneau approche, la commande n'est pas
 *   prête.
 */
export const latenessRuleSchema = z.enum([
  "not_handed_over_after_window",
  "not_ready_before_window",
]);
export type LatenessRule = z.infer<typeof latenessRuleSchema>;

/** Le créneau tel que convenu, avec sa provenance — `default` = heure d'ouverture. */
export const supervisionWindowSchema = z.object({
  start: z.string().nullable(),
  end: z.string(),
  source: fulfillmentSourceSchema,
});
export type SupervisionWindow = z.infer<typeof supervisionWindowSchema>;

/** Le compte par étape, pour UN acheminement. Les annulées sont à part. */
export const supervisionFlowSchema = z.object({
  fulfillmentMethod: fulfillmentMethodSchema,
  placed: z.number().int().nonnegative(),
  inProduction: z.number().int().nonnegative(),
  ready: z.number().int().nonnegative(),
  handedOver: z.number().int().nonnegative(),
  cancelled: z.number().int().nonnegative(),
});
export type SupervisionFlow = z.infer<typeof supervisionFlowSchema>;

/**
 * Une commande en retard. `customerName` est le NOM seul — la société, sinon la
 * personne —, jamais un e-mail ni un téléphone ; `null` si aucun nom n'est
 * connu. `orderId` sert au lien vers la commande, que l'écran n'ouvre qu'à qui
 * a `b2b_orders:read`.
 */
export const lateOrderSchema = z.object({
  orderId: z.string().min(1),
  reference: z.string(),
  customerName: z.string().nullable(),
  fulfillmentMethod: fulfillmentMethodSchema,
  window: supervisionWindowSchema,
  stage: supervisionStageSchema,
  rule: latenessRuleSchema,
});
export type LateOrder = z.infer<typeof lateOrderSchema>;

/** La vue d'un jour. `asOf` est l'instant de lecture, ISO — l'horloge du serveur. */
export const daySupervisionViewSchema = z.object({
  date: z.string(),
  asOf: z.string(),
  flow: z.array(supervisionFlowSchema),
  late: z.array(lateOrderSchema),
  /** Les commandes OUVERTES sans date de service : elles n'appartiennent à aucun jour, et attendent encore un geste. */
  undated: z.number().int().nonnegative(),
});
export type DaySupervisionView = z.infer<typeof daySupervisionViewSchema>;

import { z } from "zod";

/**
 * **Le compte à rebours du fournil** — pour une journée, ce qui doit être sorti
 * de chaque produit avant chaque heure, cumulé (plan
 * `documentation/production/plan-production-par-vagues.md`, V0 et §7.2 :
 * « l'échéance mène »).
 *
 * Lecture seule, et **prévision** : servi par `GET
 * /admin/production/batch/:date/due-thresholds`, calculé à la lecture sur les
 * commandes du plan. Une journée close n'a plus de commandes au plan : ses
 * seuils figés viendront avec le lot V1.
 *
 * L'heure d'un seuil est l'échéance de la commande — le début de sa fenêtre
 * s'il y en a un, sinon sa fin — moins la marge de son mode (livraison ou
 * retrait), ramenée à `00:00` au plus tôt. Aucun montant, aucun client.
 */

/**
 * - `deadline` : « `cumulative` avant `before` » ;
 * - `undated` : les commandes sans échéance — toujours le dernier seuil, à
 *   SIGNALER à l'écran ;
 * - `day` : les deux marges ne sont pas réglées — un seul seuil, la journée.
 */
export const dueThresholdKindSchema = z.enum(["deadline", "undated", "day"]);
export type DueThresholdKind = z.infer<typeof dueThresholdKindSchema>;

export const dueThresholdSchema = z.object({
  kind: dueThresholdKindSchema,
  /** `HH:mm` pour `deadline`, `null` sinon. */
  before: z
    .string()
    .regex(/^\d{2}:\d{2}$/u)
    .nullable(),
  /** Ce que ce seuil ajoute au précédent. */
  quantity: z.number().int().nonnegative(),
  /** Ce qui doit être sorti avant ce seuil, tout compris. */
  cumulative: z.number().int().nonnegative(),
});
export type DueThresholdView = z.infer<typeof dueThresholdSchema>;

export const productionDueThresholdLineSchema = z.object({
  sku: z.string(),
  /** Le nom figé à la commande. */
  productName: z.string(),
  total: z.number().int().nonnegative(),
  /** Triés par heure croissante ; `undated`, s'il existe, en dernier. */
  thresholds: z.array(dueThresholdSchema),
});
export type ProductionDueThresholdLine = z.infer<typeof productionDueThresholdLineSchema>;

export const productionDueThresholdsViewSchema = z.object({
  /** `AAAA-MM-JJ`. */
  date: z.string(),
  /**
   * Les marges réglées, en minutes ; `null` = non réglée. Rendues pour que
   * l'écran dise POURQUOI il n'y a qu'un seuil `day`, et à côté de quoi lire
   * la mesure (§7.1).
   */
  deliveryMarginMinutes: z.number().int().nonnegative().nullable(),
  pickupMarginMinutes: z.number().int().nonnegative().nullable(),
  /** Triées par SKU : un ordre stable. L'ordre d'affichage appartient à l'écran. */
  lines: z.array(productionDueThresholdLineSchema),
});
export type ProductionDueThresholdsView = z.infer<typeof productionDueThresholdsViewSchema>;

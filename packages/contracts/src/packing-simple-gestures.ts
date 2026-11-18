import { z } from "zod";

/**
 * **Les corps des gestes du colisage simple** (plan
 * `documentation/colisage/plan-niveaux-de-suivi-colisage.md`) — la forme
 * seulement : l'agrégat du colisage refuse ce que la règle refuse.
 */

/** « Problème » : ce qui est vraiment là, par SKU. */
export const packingProblemBodySchema = z.object({
  lines: z.array(z.object({ sku: z.string().min(1), present: z.number().int().min(0) })),
});
export type PackingProblemBody = z.infer<typeof packingProblemBodySchema>;

/** « Pièces retrouvées » : par SKU, combien — une ligne au moins. */
export const packingFoundBodySchema = z.object({
  lines: z.array(z.object({ sku: z.string().min(1), quantity: z.number().int().min(1) })).min(1),
});
export type PackingFoundBody = z.infer<typeof packingFoundBodySchema>;

/** « Tout est prêt » : rien à dire, le serveur relit la fiche et la réserve. */
export const packingAllReadyBodySchema = z.object({});
export type PackingAllReadyBody = z.infer<typeof packingAllReadyBodySchema>;

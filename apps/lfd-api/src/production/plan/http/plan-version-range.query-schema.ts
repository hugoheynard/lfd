import { z } from "zod";

/** Un numéro de version, lu dans l'URL : un entier positif. */
const versionNumber = z.coerce
  .number()
  .int("un numéro de version est un entier")
  .min(1, "les versions se numérotent à partir de 1");

/**
 * **Les deux versions à comparer, lues dans l'URL** (`?from=&to=`) — la forme
 * seulement. Que `from` précède `to` et que les versions existent, c'est le
 * diff du noyau qui le juge (400 et 404, nommés).
 */
export const planVersionRangeQuerySchema = z.object({
  from: versionNumber,
  to: versionNumber,
});

export type PlanVersionRangeQuery = z.infer<typeof planVersionRangeQuerySchema>;

import { z } from "zod";

import { healthStatusSchema } from "./node.js";

/**
 * **Heartbeat** — ce qu'une brique **pousse** périodiquement (même à vide) pour
 * dire « je suis là, voici mon état ». Validé par l'ingest OPS. `at` est un ISO ;
 * `metrics` est optionnel et volontairement plat (pas de télémétrie fine — OPS
 * est une carte de santé, pas un APM).
 */
export const heartbeatMetricsSchema = z.object({
  queueDepth: z.number().int().min(0).optional(),
  inFlight: z.number().int().min(0).optional(),
  lastJobAt: z.string().optional(),
  /** Taux d'erreur sur la dernière minute, 0..1. */
  errorRate1m: z.number().min(0).max(1).optional(),
});
export type HeartbeatMetrics = z.infer<typeof heartbeatMetricsSchema>;

export const heartbeatSchema = z.object({
  /** Id stable du nœud émetteur (ex. `pim.sync-shopify`). */
  node: z.string().min(1),
  at: z.string().min(1),
  /** Ce que le nœud dit **de lui-même** (OPS peut le corriger, cf. design §8). */
  status: healthStatusSchema,
  detail: z.string().optional(),
  metrics: heartbeatMetricsSchema.optional(),
});
export type Heartbeat = z.infer<typeof heartbeatSchema>;

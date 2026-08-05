import { z } from "zod";

/**
 * **Event de cycle de vie** — ponctuel, contrairement au heartbeat périodique.
 * Alimente l'historique (timelines, taux d'erreur, incidents) côté OPS. `ref` =
 * corrélation (id de job, sha de déploiement).
 */
export const lifecycleEventKindSchema = z.enum([
  "job.started",
  "job.ok",
  "job.failed",
  "deploy",
  "config.changed",
]);
export type LifecycleEventKind = z.infer<typeof lifecycleEventKindSchema>;

export const lifecycleEventSchema = z.object({
  node: z.string().min(1),
  at: z.string().min(1),
  kind: lifecycleEventKindSchema,
  ref: z.string().optional(),
  message: z.string().optional(),
});
export type LifecycleEvent = z.infer<typeof lifecycleEventSchema>;

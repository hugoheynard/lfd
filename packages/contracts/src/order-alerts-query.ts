import { z } from "zod";

/** Au plus une page de la liste des commandes : la limite haute de `GET /admin/orders`. */
export const ORDER_ALERTS_MAX_ORDERS = 200;

/**
 * Requête de `GET /admin/alerts?orderIds=a,b,c` — les alertes d'une page de
 * commandes, en une lecture (plan du visa des commandes, V4). Les
 * identifiants arrivent séparés par des virgules ; vides et doublons sont
 * ignorés.
 */
export const orderAlertsQuerySchema = z.object({
  orderIds: z
    .string()
    .trim()
    .min(1)
    .transform((raw) => [
      ...new Set(
        raw
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      ),
    ])
    .pipe(z.array(z.string()).min(1).max(ORDER_ALERTS_MAX_ORDERS)),
});
export type OrderAlertsQuery = z.infer<typeof orderAlertsQuerySchema>;

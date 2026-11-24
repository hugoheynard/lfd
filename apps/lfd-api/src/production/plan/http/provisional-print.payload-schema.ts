import { z } from "zod";

import type { ProvisionalChoice } from "../domain/entities/provisional-print.js";
import { DOSSIER_PARTS } from "../domain/services/day-dossier-selection.js";

/**
 * **Ce que la fenêtre coche pour une impression provisoire** — la forme
 * seulement : qu'une commande ou un rayon soit au jour, qu'un tirage #N
 * existe, c'est le domaine qui le dit.
 *
 * - `parts` : les parties du dossier, au moins une ;
 * - `groups` : `"all"`, ou les libellés de rayons ou de postes cochés ;
 * - `orders` : toutes (`all`), nouvelles ou modifiées depuis le tirage `run`
 *   (`since`), ou celles cochées (`chosen`).
 */
export const provisionalPrintPayloadSchema = z.object({
  parts: z.array(z.enum(DOSSIER_PARTS)).min(1, "cochez au moins une partie"),
  groups: z.union([
    z.literal("all"),
    z.array(z.string().trim().min(1)).min(1, "cochez au moins un rayon ou un poste"),
  ]),
  orders: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("all") }),
    z.object({ kind: z.literal("since"), run: z.number().int().min(1) }),
    z.object({
      kind: z.literal("chosen"),
      orderIds: z.array(z.string().min(1)).min(1, "cochez au moins une commande"),
    }),
  ]),
});

export type ProvisionalPrintPayload = z.infer<typeof provisionalPrintPayloadSchema>;

/** Le choix du domaine. */
export function provisionalChoiceOf(payload: ProvisionalPrintPayload): ProvisionalChoice {
  const { orders } = payload;
  return {
    parts: new Set(payload.parts),
    groups: payload.groups === "all" ? "all" : new Set(payload.groups),
    orders:
      orders.kind === "chosen" ? { kind: "chosen", orderIds: new Set(orders.orderIds) } : orders,
  };
}

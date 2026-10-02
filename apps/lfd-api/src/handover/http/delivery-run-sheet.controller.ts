import {
  hasStaffPermission,
  type DeliveryRunSheetView,
  type StaffPermission,
} from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { StaffPermissions } from "../../platform/auth/staff.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryRunSheetQuery } from "../application/queries/get-delivery-run-sheet.query.js";

/** Combien de commandes d'un autre jour une feuille peut nommer. */
const MAX_ALSO_ORDERS = 200;
const MAX_ORDER_ID_LENGTH = 64;

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const runSheetQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
  // Les livraisons d'un autre jour placées ce jour-là (commandes rapportées),
  // séparées par des virgules. Bornées : c'est une poignée, pas un export.
  commandes: z
    .string()
    .optional()
    .transform((value) => (value ?? "").split(",").filter((id) => id.length > 0))
    .pipe(
      z
        .array(z.string().max(MAX_ORDER_ID_LENGTH))
        .max(MAX_ALSO_ORDERS, `au plus ${MAX_ALSO_ORDERS} commandes`),
    ),
});
type RunSheetQuery = z.infer<typeof runSheetQuerySchema>;

/**
 * **La feuille de route des livraisons** — lecture seule
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 1).
 *
 * Sous `delivery_run_sheet` depuis le 2026-09-29 (plan, Q7/Q8) : elle était
 * servie sous `b2b_orders`, qui ouvrait les adresses et contacts de TOUTES les
 * livraisons à quiconque prend une commande. `support` et `commercial` en
 * gardent la lecture ; `comptabilite` la perd. Aucun montant. Il n'injecte que
 * le `QueryBus`.
 *
 * La procédure de livraison (texte et photos) relève de `delivery_procedures`
 * depuis le 2026-10-01 (`plan-droits-par-geste.md`, DG-D8) : sans ce droit, la
 * feuille part avec des procédures vides.
 *
 * `commandes` (2026-10-02) : les livraisons d'un autre jour que l'écran des
 * tournées sait placées ce jour-là — une commande rapportée replacée. Même
 * droit, même masque de procédure : ce droit ouvre déjà toutes les
 * livraisons de tous les jours, en changeant `jour`.
 */
@Controller("admin/livraison")
@AdminSurface("delivery_run_sheet")
export class DeliveryRunSheetController {
  constructor(private readonly queries: QueryBus) {}

  @Get("feuille-de-route")
  runSheet(
    @Query(new ZodQuery(runSheetQuerySchema)) query: RunSheetQuery,
    @StaffPermissions() permissions: readonly StaffPermission[],
  ): Promise<DeliveryRunSheetView> {
    return this.queries.execute<GetDeliveryRunSheetQuery, DeliveryRunSheetView>(
      new GetDeliveryRunSheetQuery(
        query.jour,
        hasStaffPermission(permissions, "delivery_procedures:read"),
        query.commandes,
      ),
    );
  }
}

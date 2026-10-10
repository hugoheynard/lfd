import type { DeliveryPackingRoundsView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryPackingRoundsQuery } from "../application/queries/get-delivery-packing-rounds.query.js";

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Le colisage vu de la livraison** — `admin/livraison/colisage/…`.
 *
 * La proposition de colisage d'une commande (`GET proposition`, lot 4 bis,
 * L4b-C4) est retirée le 2026-10-10 (`documentation/colisage/colisage.md` §9,
 * voie (b)) : le poste lit celle du colisage (`GET admin/packing/:date/orders/
 * :orderId/proposal`), qui passe par `BinDesk` jusqu'au même cas de lecture.
 * Il n'injecte que le bus des requêtes.
 */
@Controller("admin/livraison/colisage")
@AdminSurface("delivery_loading")
export class DeliveryPackingController {
  constructor(private readonly queries: QueryBus) {}

  /**
   * Les tournées du jour vues du poste (lot PC2, 2026-10-02) : où va chaque
   * commande, « n prêtes sur m », « à refaire ». Une LECTURE — sous le droit
   * qui OUVRE le poste (`production_packing:read`) ou celui du chargement :
   * ranger ses bacs ne demande pas de pouvoir en déclarer.
   */
  @Get("tournees")
  @RequireAnyPermission("production_packing:read", "delivery_loading:read")
  rounds(@Query(new ZodQuery(dayQuerySchema)) query: DayQuery): Promise<DeliveryPackingRoundsView> {
    return this.queries.execute<GetDeliveryPackingRoundsQuery, DeliveryPackingRoundsView>(
      new GetDeliveryPackingRoundsQuery(query.jour),
    );
  }
}

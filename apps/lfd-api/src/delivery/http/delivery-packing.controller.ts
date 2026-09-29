import type { DeliveryPackingProposalView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryPackingProposalQuery } from "../application/queries/get-delivery-packing-proposal.query.js";

/** La commande dont on propose le colisage, validée dans sa FORME. */
const orderQuerySchema = z.object({ commande: z.string().trim().min(1, "commande requise") });
type OrderQuery = z.infer<typeof orderQuerySchema>;

/**
 * **Le colisage proposé** d'une commande livrée
 * (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4 bis,
 * L4b-C4, tranche C) — `GET admin/livraison/colisage/proposition?commande=`.
 *
 * Sous `delivery_loading`, comme la déclaration qu'elle précède : qui peut
 * déclarer des bacs peut lire ce qu'on lui propose. Une LECTURE, jamais
 * imposée. Il n'injecte que le bus des requêtes.
 */
@Controller("admin/livraison/colisage")
@AdminSurface("delivery_loading")
export class DeliveryPackingController {
  constructor(private readonly queries: QueryBus) {}

  @Get("proposition")
  proposal(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryPackingProposalView> {
    return this.queries.execute<GetDeliveryPackingProposalQuery, DeliveryPackingProposalView>(
      new GetDeliveryPackingProposalQuery(query.commande),
    );
  }
}

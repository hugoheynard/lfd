import type { DeliveryPackingProposalView, DeliveryPackingRoundsView } from "@lfd/contracts";
import { Controller, Get, Query } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import { z } from "zod";

import { AdminSurface, RequireAnyPermission } from "../../platform/auth/admin-surface.decorator.js";
import { ZodQuery } from "../../platform/shared/http/zod-body.pipe.js";
import { GetDeliveryPackingProposalQuery } from "../application/queries/get-delivery-packing-proposal.query.js";
import { GetDeliveryPackingRoundsQuery } from "../application/queries/get-delivery-packing-rounds.query.js";

/** La commande dont on propose le colisage, validée dans sa FORME. */
const orderQuerySchema = z.object({ commande: z.string().trim().min(1, "commande requise") });
type OrderQuery = z.infer<typeof orderQuerySchema>;

/** Le jour de service, validé dans sa FORME — le message nomme le paramètre. */
const dayQuerySchema = z.object({
  jour: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "jour attendu au format AAAA-MM-JJ"),
});
type DayQuery = z.infer<typeof dayQuerySchema>;

/**
 * **Le colisage proposé** d'une commande livrée
 * (`documentation/livraisons/tournees/plan-preparation-de-tournee.md`, lot 4 bis,
 * L4b-C4, tranche C) — `GET admin/livraison/colisage/proposition?commande=`.
 *
 * Sous `delivery_loading`, comme la déclaration qu'elle précède : qui peut
 * déclarer des bacs peut lire ce qu'on lui propose. Une LECTURE, jamais
 * imposée. Il n'injecte que le bus des requêtes.
 *
 * 🔴 La porte s'ouvre AUSSI au colisage (2026-10-01, `documentation/livraisons/droits/plan-droits-par-geste.md`,
 * 5.3) : chaque route exige `production_packing:write` OU
 * `delivery_loading:write` — lectures comprises, comme le plan l'écrit : le
 * panneau est un geste d'écriture, et qui ne fait que lire le colisage
 * (le support) n'a rien à y faire. On élargit la porte, on ne déplace aucun
 * droit — aucune dérogation n'a donc à fusionner.
 */
@Controller("admin/livraison/colisage")
@AdminSurface("delivery_loading")
export class DeliveryPackingController {
  constructor(private readonly queries: QueryBus) {}

  @Get("proposition")
  @RequireAnyPermission("production_packing:write", "delivery_loading:write")
  proposal(
    @Query(new ZodQuery(orderQuerySchema)) query: OrderQuery,
  ): Promise<DeliveryPackingProposalView> {
    return this.queries.execute<GetDeliveryPackingProposalQuery, DeliveryPackingProposalView>(
      new GetDeliveryPackingProposalQuery(query.commande),
    );
  }

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

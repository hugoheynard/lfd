import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { PointOfSaleView } from "@lfd/pim-contracts";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListPointsOfSaleQuery } from "../application/list-points-of-sale.js";

/**
 * **Points de vente** — d'où l'on vend : les boutiques et la plateforme
 * professionnelle, dans une seule liste.
 *
 * **Lecture seule**, en p-0. Les boutiques s'écrivent encore par `locations`,
 * qui tient ce miroir dans sa propre transaction ; la plateforme, elle, ne
 * s'écrit nulle part — elle est semée au boot et ineffaçable.
 *
 * `@AdminSurface("catalog")` dérive l'action du verbe : un `GET` demande
 * `catalog:read`, que tout rôle du back-office porte.
 */
@AdminSurface("catalog")
@Controller("points-of-sale")
export class PointOfSaleController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  listPointsOfSale(): Promise<readonly PointOfSaleView[]> {
    return this.queries.execute<ListPointsOfSaleQuery, readonly PointOfSaleView[]>(
      new ListPointsOfSaleQuery(),
    );
  }
}

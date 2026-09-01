import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { ListActivationsQuery } from "../application/queries/list-activations.query.js";
import type { ActivationView } from "@lfd/contracts";

/**
 * Surface **staff** : le **tunnel d'activation** (complétion des pièces,
 * adoption-stalled, adoption+), dérivé du journal, pour l'onglet « Activation &
 * frictions ». Même montage `@AdminSurface` que les autres routes `/admin/*`.
 */
@Controller("admin/activations")
@AdminSurface("b2b_companies")
export class AdminActivationsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<ActivationView[]> {
    return this.queries.execute<ListActivationsQuery, ActivationView[]>(new ListActivationsQuery());
  }
}

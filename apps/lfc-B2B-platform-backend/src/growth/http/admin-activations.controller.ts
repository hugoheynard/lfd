import { Controller, Get, UseGuards } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminAuthGuard } from "../../infra/auth/admin-auth.guard.js";
import { Public } from "../../infra/auth/public.decorator.js";
import { ListActivationsQuery } from "../application/queries/list-activations.query.js";
import type { ActivationView } from "../domain/activation.js";

/**
 * Surface **staff** : le **tunnel d'activation** (complétion des pièces,
 * adoption-stalled, adoption+), dérivé du journal, pour l'onglet « Activation &
 * frictions ». Même montage à deux surfaces que les autres routes `/admin/*`.
 */
@Controller("admin/activations")
@Public()
@UseGuards(AdminAuthGuard)
export class AdminActivationsController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  list(): Promise<ActivationView[]> {
    return this.queries.execute<ListActivationsQuery, ActivationView[]>(new ListActivationsQuery());
  }
}

import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";
import type { CapabilitiesReport } from "@lfd/ops-contract";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { ReadCapabilitiesQuery } from "./read-capabilities.query.js";

/**
 * Les capacités éteintes, pour la carte OPS. **Staff only**, sous `ops_health`,
 * lecture seule.
 *
 * La route au jeton d'exploitation (`/admin/ops/capabilities`) reste ce qu'elle
 * est : le cron et l'exploitation s'en servent sans personne derrière. Celle-ci
 * sert la personne connectée au back-office, qui n'a ni jeton ni journal. Les
 * deux lisent le même bulletin ; la réponse ne porte que des NOMS de
 * variables, jamais une valeur.
 */
@Controller("admin/ops/capabilities/staff")
@AdminSurface("ops_health")
export class AdminCapabilitiesController {
  constructor(private readonly queries: QueryBus) {}

  @Get()
  read(): Promise<CapabilitiesReport> {
    return this.queries.execute<ReadCapabilitiesQuery, CapabilitiesReport>(
      new ReadCapabilitiesQuery(),
    );
  }
}

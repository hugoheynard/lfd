import type { WorkshopShortcutsView } from "@lfd/contracts";
import { Controller, Get } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../platform/auth/admin-surface.decorator.js";
import { GetWorkshopShortcutsQuery } from "../application/queries/get-workshop-shortcuts.query.js";

/**
 * **Les raccourcis, vus de la fiche d'atelier** (plan
 * `documentation/fournil/plan-raccourcis-du-fournil.md`, S2).
 *
 * Sous `production_worksheet`, le droit de la fiche — et non sous
 * `production_settings` : le fournil qui compte en plaques n'a pas à tenir le
 * droit de les régler. Un contrôleur à part de celui des réglages pour cette
 * seule raison : un `@AdminSurface` par classe. Il n'injecte que le bus.
 */
@Controller("admin/production/shortcuts")
@AdminSurface("production_worksheet")
export class ProductionWorkshopShortcutsController {
  constructor(private readonly queries: QueryBus) {}

  /** Les raccourcis vivants par SKU, sans les articles. */
  @Get()
  shortcuts(): Promise<WorkshopShortcutsView> {
    return this.queries.execute<GetWorkshopShortcutsQuery, WorkshopShortcutsView>(
      new GetWorkshopShortcutsQuery(),
    );
  }
}

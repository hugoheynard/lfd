import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { LaunchedResupplies } from "../../channels/commerce/launched-resupplies.js";
import { LaunchedResupplyLookup } from "../../domain/ports/launched-resupply.lookup.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * {@link LaunchedResupplies} tel que le fournil l'implémente : verrou de la
 * journée, PUIS lecture du seul réassort (`LaunchedResupplyLookup` — la
 * journée entière n'est plus relue depuis le 2026-11-02). Le lancement prend
 * le même verrou avant de lire le réassort au commerce. L'unité de travail
 * REJOINT celle de l'appelant — l'annulation du commerce, qui écrit le
 * réassort annulé avant de la valider : le verrou tient jusque-là.
 */
@Injectable()
export class ProductionLaunchedResupplies extends LaunchedResupplies {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly launched: LaunchedResupplyLookup,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      return this.launched.isLaunched(day, resupplyId);
    });
  }
}

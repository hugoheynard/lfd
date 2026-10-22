import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { LaunchedResupplies } from "../../channels/commerce/launched-resupplies.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import type { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * {@link LaunchedResupplies} tel que le fournil l'implémente (R4a) : verrou
 * de la journée, PUIS relecture de la journée. Le lancement prend le même
 * verrou avant de lire le réassort au commerce. L'unité de travail REJOINT
 * celle de l'appelant — l'annulation du commerce, qui écrit le réassort
 * annulé avant de la valider : le verrou tient jusque-là.
 */
@Injectable()
export class ProductionLaunchedResupplies extends LaunchedResupplies {
  constructor(
    private readonly lock: ProductionDayLock,
    private readonly days: ProductionDayRepository,
    private readonly uow: UnitOfWork,
  ) {
    super();
  }

  isLaunched(day: ServiceDay, resupplyId: string): Promise<boolean> {
    return this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      return current.launchedResupplies.some((resupply) => resupply.resupplyId === resupplyId);
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { ProductionBatchRepository } from "../../domain/ports/production-batch.repository.js";
import { ProductionDayLock } from "../../domain/ports/production-day.lock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { CancelBatchCommand } from "./cancel-batch.command.js";

/**
 * **La fournée ne compte plus.**
 *
 * 🔴 **Sous le verrou de la journée** (D4) : l'annulation est refusée s'il
 * resterait moins de pièces sorties que de pièces au bac, et un colisage validé
 * entre la lecture et l'écriture rendrait ce refus faux. Verrou, PUIS relecture,
 * PUIS écriture — dans une seule unité de travail.
 *
 * Annuler une fournée déjà annulée est un succès silencieux. Annuler une coche
 * héritée (fournée implicite, §5.2) la matérialise d'abord : on n'annule pas
 * une ligne qui n'existe pas.
 *
 * @sans-journal geste d'atelier, sous le même régime que la coche (plan, D7).
 */
@CommandHandler(CancelBatchCommand)
export class CancelBatchHandler implements ICommandHandler<CancelBatchCommand, void> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly batches: ProductionBatchRepository,
    private readonly lock: ProductionDayLock,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CancelBatchCommand): Promise<void> {
    const day = ServiceDay.of(command.serviceDay);
    await this.uow.run(async () => {
      await this.lock.lock(day);
      const current = await this.days.load(day);
      const target = current.batchToCancel(command.batchId);
      if (target === null) {
        return;
      }
      for (const inherited of current.materialize(target.sku)) {
        await this.batches.record(day, inherited);
      }
      await this.batches.cancel(day, target.id, {
        at: this.clock.now(),
        by: command.staffUserId,
      });
    });
  }
}

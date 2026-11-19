import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { CounterStockTracking } from "../domain/counter-stock-tracking.js";
import { StockAlertNotFoundError } from "../domain/stock-alert-errors.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { assertStockTracked } from "./assert-stock-tracked.js";
import { LiftStockAlertCommand } from "./lift-stock-alert.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Lève une alerte à la main** — le « OK » du comptoir. Chargée sous le
 * point de l'URL : celle d'un autre point est introuvable. Refusée (409) si
 * le point ne suit pas son stock : l'alerte reste alors lisible, et la
 * réception d'un réassort de l'article la lève toujours.
 */
@CommandHandler(LiftStockAlertCommand)
export class LiftStockAlertHandler implements ICommandHandler<LiftStockAlertCommand, void> {
  constructor(
    private readonly alerts: StockAlertRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly tracking: CounterStockTracking,
  ) {}

  async execute(command: LiftStockAlertCommand): Promise<void> {
    await assertStockTracked(this.tracking, command.siteId);
    const alert = await this.alerts.load(command.siteId, command.alertId);
    if (alert === null) {
      throw new StockAlertNotFoundError(command.alertId);
    }
    alert.liftByHand(await traceOf(this.staff, this.clock, command.staffUserId));
    await this.alerts.save(alert);
  }
}

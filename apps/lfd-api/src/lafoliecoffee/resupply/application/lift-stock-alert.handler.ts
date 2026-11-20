import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { StockAlertNotFoundError } from "../domain/stock-alert-errors.js";
import { StockAlertRepository } from "../domain/stock-alert.repository.js";
import { LiftStockAlertCommand } from "./lift-stock-alert.command.js";
import { traceOf } from "./resupply-receipt-trace.js";

/**
 * **Lève une alerte à la main** — le « OK » du comptoir. Chargée sous le
 * point de l'URL : celle d'un autre point est introuvable. Permise même
 * quand le point ne suit pas son stock (décidé par Hugo le 2026-11-19) : une
 * alerte ouverte avant la désactivation doit pouvoir se fermer à la main.
 */
@CommandHandler(LiftStockAlertCommand)
export class LiftStockAlertHandler implements ICommandHandler<LiftStockAlertCommand, void> {
  constructor(
    private readonly alerts: StockAlertRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: LiftStockAlertCommand): Promise<void> {
    const alert = await this.alerts.load(command.siteId, command.alertId);
    if (alert === null) {
      throw new StockAlertNotFoundError(command.alertId);
    }
    alert.liftByHand(await traceOf(this.staff, this.clock, command.staffUserId));
    await this.alerts.save(alert);
  }
}

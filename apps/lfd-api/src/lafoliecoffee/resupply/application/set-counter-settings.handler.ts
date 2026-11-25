import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { CounterStockSettingsWriter } from "../domain/counter-stock-settings.writer.js";
import { ResupplySiteUnknownError } from "../domain/resupply-site-errors.js";
import { ResupplySites } from "../domain/resupply-sites.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SetCounterSettingsCommand } from "./set-counter-settings.command.js";

/**
 * **Règle le comptoir d'un point** — le suivi du stock et le retrait immédiat sans stock. Un point inconnu ou archivé est
 * refusé (404) ; sinon le réglage est posé, auteur et instant compris. Ni
 * les alertes ouvertes, ni le stock du jour, ni la réception n'en changent.
 */
@CommandHandler(SetCounterSettingsCommand)
export class SetCounterSettingsHandler implements ICommandHandler<SetCounterSettingsCommand, void> {
  constructor(
    private readonly sites: ResupplySites,
    private readonly settings: CounterStockSettingsWriter,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetCounterSettingsCommand): Promise<void> {
    if (!(await this.sites.exists(command.siteId))) {
      throw new ResupplySiteUnknownError(command.siteId);
    }
    await this.settings.put({
      siteId: command.siteId,
      stockTracking: command.stockTracking,
      immediateWithoutStock: command.immediateWithoutStock,
      updated: await traceOf(this.staff, this.clock, command.staffUserId),
    });
  }
}

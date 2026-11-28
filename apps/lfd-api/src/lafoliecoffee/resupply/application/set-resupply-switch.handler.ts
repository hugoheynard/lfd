import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { StaffDirectory } from "../../account/domain/ports/staff-directory.js";
import { ResupplySwitchWriter } from "../domain/resupply-switch.writer.js";
import { traceOf } from "./resupply-receipt-trace.js";
import { SetResupplySwitchCommand } from "./set-resupply-switch.command.js";

/**
 * **Allume ou éteint le réassort**, auteur et instant compris. Éteindre ne
 * retire rien : ce qui a été envoyé reste lisible au fournil et au colisage,
 * seules les écritures sont refusées ensuite.
 */
@CommandHandler(SetResupplySwitchCommand)
export class SetResupplySwitchHandler implements ICommandHandler<SetResupplySwitchCommand, void> {
  constructor(
    private readonly switches: ResupplySwitchWriter,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetResupplySwitchCommand): Promise<void> {
    await this.switches.put({
      enabled: command.enabled,
      updated: await traceOf(this.staff, this.clock, command.staffUserId),
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../infra/time/clock.js";
import { AccountAlertRepository } from "../../domain/ports/account-alert.repository.js";
import { AcknowledgeAlertCommand } from "./acknowledge-alert.command.js";

/**
 * Acquitte une alerte. Idempotent, et **le premier acquittement fait foi** : deux
 * clics ne doivent pas réécrire qui a vu quoi, ni quand.
 */
@CommandHandler(AcknowledgeAlertCommand)
export class AcknowledgeAlertHandler implements ICommandHandler<AcknowledgeAlertCommand, void> {
  constructor(
    private readonly journal: AccountAlertRepository,
    private readonly clock: Clock,
  ) {}

  async execute(command: AcknowledgeAlertCommand): Promise<void> {
    await this.journal.acknowledge(command.alertId, command.staffSub, this.clock.now());
  }
}

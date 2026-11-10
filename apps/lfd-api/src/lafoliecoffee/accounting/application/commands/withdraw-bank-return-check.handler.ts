import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BankReturnCheckRecordedEvent } from "../../domain/events/bank-return-check.events.js";
import { BankReturnCheckRepository } from "../../domain/ports/bank-return-check.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { WithdrawBankReturnCheckCommand } from "./withdraw-bank-return-check.command.js";

/**
 * **Retirer « Retours contrôlés »** (P3) : une ligne `withdrawn` de plus,
 * avec sa note — rien ne s'efface, la dernière ligne du jour fait foi.
 */
@CommandHandler(WithdrawBankReturnCheckCommand)
export class WithdrawBankReturnCheckHandler implements ICommandHandler<
  WithdrawBankReturnCheckCommand,
  string
> {
  constructor(
    private readonly entities: LegalEntityReader,
    private readonly checks: BankReturnCheckRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WithdrawBankReturnCheckCommand): Promise<string> {
    const at = this.clock.now();
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    return this.uow.run(async () => {
      const checkDay = await this.checks.load(entity.id, command.day);
      const stamp = { at, staffId: command.staffUserId };
      const entry = checkDay.withdraw(this.ids.next(), stamp, command.note);
      await this.checks.save(checkDay);
      await this.events.publishTraced(
        new BankReturnCheckRecordedEvent(entry, journalEntity(entity)),
      );
      return entry.id;
    });
  }
}

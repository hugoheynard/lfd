import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BankReturnCheckRecordedEvent } from "../../domain/events/bank-return-check.events.js";
import { BankReturnCheckRepository } from "../../domain/ports/bank-return-check.repository.js";
import { LegalEntityReader } from "../../domain/ports/legal-entity.reader.js";
import { exportEntityOrFail, journalEntity } from "../mandate-bank-export-support.js";
import { AttestBankReturnCheckCommand } from "./attest-bank-return-check.command.js";

/**
 * **« Retours contrôlés »** (P3) : une ligne de plus au registre, et son fait.
 * L'agrégat refuse un jour déjà attesté ou à venir. Ne conditionne AUCUN
 * geste : l'onglet 4 seul le lit.
 */
@CommandHandler(AttestBankReturnCheckCommand)
export class AttestBankReturnCheckHandler implements ICommandHandler<
  AttestBankReturnCheckCommand,
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

  async execute(command: AttestBankReturnCheckCommand): Promise<string> {
    const at = this.clock.now();
    const today = instantToLocal(at).day;
    const entity = await exportEntityOrFail(this.entities, command.legalEntityId);
    return this.uow.run(async () => {
      const checkDay = await this.checks.load(entity.id, command.day ?? today);
      const entry = checkDay.attest(this.ids.next(), { at, staffId: command.staffUserId }, today);
      await this.checks.save(checkDay);
      await this.events.publishTraced(
        new BankReturnCheckRecordedEvent(entry, journalEntity(entity)),
      );
      return entry.id;
    });
  }
}

import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { NOTHING_TO_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CompanyNotFoundError } from "../../domain/errors/account-errors.js";
import { CompanyContactedEvent } from "../../domain/events/company-contacted.event.js";
import { companyNamed } from "../../domain/events/journal-names.js";
import { CompanyRepository } from "../../domain/ports/company.repository.js";
import { NotedContact } from "../../domain/value-objects/noted-contact.js";
import { NoteCompanyContactCommand } from "./note-company-contact.command.js";

/** Le nom stable du geste, dans le registre des intentions. */
const NOTE_COMPANY_CONTACT_GESTURE = "account.note-company-contact";

/**
 * Note un échange avec une société : un fait `company.contacted` au journal,
 * et rien d'autre — pas de table neuve. Le suivi commercial le relit pour dater
 * la montée vers « Contactée ».
 *
 * Le jour se juge au jour civil de Paris de la requête : à 0 h 30 à Paris, le
 * jour UTC est encore la veille, et refuser « aujourd'hui » serait faux.
 *
 * **Une fois par intention** : un double clic ne note pas deux contacts. La
 * clé est scellée dans la transaction qui écrit le fait ; un vrai second
 * contact est une intention neuve.
 *
 * @throws {CompanyNotFoundError} la société n'existe pas.
 * @throws {NotedContactInFutureError} l'échange est daté après aujourd'hui.
 */
@CommandHandler(NoteCompanyContactCommand)
export class NoteCompanyContactHandler implements ICommandHandler<NoteCompanyContactCommand, void> {
  constructor(
    private readonly companies: CompanyRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: NoteCompanyContactCommand): Promise<void> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: NOTE_COMPANY_CONTACT_GESTURE,
        subject: intentSubject(command.companyId, command.mode, command.date, command.note),
      },
      NOTHING_TO_REPLAY,
      (seal) => this.note(command, seal),
    );
  }

  private async note(
    command: NoteCompanyContactCommand,
    seal: (result: void) => Promise<void>,
  ): Promise<void> {
    const company = await this.companies.load(command.companyId);
    if (company === null) {
      throw new CompanyNotFoundError(command.companyId);
    }
    const today = instantToLocal(this.clock.now()).day;
    const contact = NotedContact.note(
      command.note === undefined
        ? { mode: command.mode, date: command.date }
        : { mode: command.mode, date: command.date, note: command.note },
      today,
    );
    await this.uow.run(async () => {
      await this.events.publishTraced(
        new CompanyContactedEvent(companyNamed(command.companyId, company), contact),
      );
      await seal();
    });
  }
}

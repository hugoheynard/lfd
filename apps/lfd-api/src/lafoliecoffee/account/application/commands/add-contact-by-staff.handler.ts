import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { intentSubject } from "../../../../platform/intent/intent-subject.js";
import { CREATED_ID_REPLAY, OncePerIntent } from "../../../../platform/intent/once-per-intent.js";
import { ContactAddedByStaffEvent } from "../../domain/events/staff-contact-acts.event.js";
import { ContactDetails } from "../../domain/value-objects/contact-details.js";
import { CompanyContactBook } from "../services/company-contact-book.service.js";
import { AddContactByStaffCommand } from "./add-contact-by-staff.command.js";
import { AccountJournalNames } from "../services/account-journal-names.service.js";
import { contactRef } from "../../domain/events/journal-names.js";
import { CONTACT_ADDED } from "../../domain/events/site-gesture.fact.js";
import { SiteGesturePublisher } from "../services/site-gesture.publisher.js";

/** Le nom stable du geste, dans le registre des intentions. */
const ADD_CONTACT_GESTURE = "account.add-contact-by-staff";

/**
 * Ajoute un interlocuteur **additionnel** — un carnet d'adresses, pas un accès.
 *
 * **Une fois par intention** : la clé de l'écran est réclamée avant tout et
 * scellée dans la transaction de l'ajout ; un double clic rend le contact déjà
 * ajouté, sans second contact ni second fait. Le sujet est la société et
 * l'empreinte de la saisie : la même clé sur un autre contact est refusée (409).
 *
 * @throws {GestureInFlightError} la même clé est encore en vol.
 * @throws {IntentKeyReusedError} la clé a servi pour un autre ajout.
 */
@CommandHandler(AddContactByStaffCommand)
export class AddContactByStaffHandler implements ICommandHandler<AddContactByStaffCommand, string> {
  constructor(
    private readonly book: CompanyContactBook,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly names: AccountJournalNames,
    private readonly gestures: SiteGesturePublisher,
    private readonly intents: OncePerIntent,
  ) {}

  execute(command: AddContactByStaffCommand): Promise<string> {
    return this.intents.runSealed(
      {
        actorId: command.staffUserId,
        key: command.intentKey,
        gesture: ADD_CONTACT_GESTURE,
        subject: intentSubject(command.companyId, command.details, command.role),
      },
      CREATED_ID_REPLAY,
      (seal) => this.add(command, seal),
    );
  }

  private async add(
    command: AddContactByStaffCommand,
    seal: (contactId: string) => Promise<void>,
  ): Promise<string> {
    const details = ContactDetails.create(command.details);
    const company = await this.names.company(command.companyId);
    return await this.uow.run(async () => {
      const contactId = await this.book.add(command.companyId, details, command.role);
      await this.gestures.publish({
        type: CONTACT_ADDED,
        site: company,
        subjectId: contactId,
        actor: { kind: "team" },
      });
      await this.events.publishTraced(
        new ContactAddedByStaffEvent(company, contactRef(contactId, details), command.role),
      );
      await seal(contactId);
      return contactId;
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { StaffContacts } from "../../../staff/directory/domain/staff-contacts.js";
import { DossierRecipient } from "../../domain/entities/dossier-recipient.js";
import { DossierRecipientAddedEvent } from "../../domain/events/dossier-recipient.events.js";
import { DossierRecipientsRepository } from "../../domain/ports/dossier-recipients.repository.js";
import { AddStaffDossierRecipientCommand } from "./add-staff-dossier-recipient.command.js";

/**
 * **Inscrire une personne du personnel** aux destinataires du dossier (plan
 * `plan-envoi-du-dossier.md`, décision 4, lot E2).
 *
 * La fiche est lue dans l'annuaire par son port de lecture : inconnue ou
 * suspendue, la factory la refuse ; son adresse déjà inscrite, la liste la
 * refuse. Rend l'identifiant de la ligne.
 */
@CommandHandler(AddStaffDossierRecipientCommand)
export class AddStaffDossierRecipientHandler implements ICommandHandler<
  AddStaffDossierRecipientCommand,
  string
> {
  constructor(
    private readonly recipients: DossierRecipientsRepository,
    private readonly staff: StaffContacts,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddStaffDossierRecipientCommand): Promise<string> {
    const cards = await this.staff.contactsOf([command.recipientStaffUserId]);
    const recipient = DossierRecipient.ofStaff(
      command.recipientStaffUserId,
      cards.get(command.recipientStaffUserId) ?? null,
      { id: this.ids.next(), addedBy: command.staffUserId, addedAt: this.clock.now() },
    );
    await this.uow.run(async () => {
      const list = await this.recipients.load();
      list.add(recipient);
      await this.recipients.save(list);
      await this.events.publishTraced(new DossierRecipientAddedEvent(recipient));
    });
    return recipient.id;
  }
}

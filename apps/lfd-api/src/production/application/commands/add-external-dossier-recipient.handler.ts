import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DossierRecipient } from "../../domain/entities/dossier-recipient.js";
import { DossierRecipientAddedEvent } from "../../domain/events/dossier-recipient.events.js";
import { DossierRecipientsRepository } from "../../domain/ports/dossier-recipients.repository.js";
import { AddExternalDossierRecipientCommand } from "./add-external-dossier-recipient.command.js";

/**
 * **Inscrire une autre personne** aux destinataires du dossier (plan
 * `dossier-prod-du-jour.md`, décision 4, lot E2).
 *
 * L'adresse et le nom sont jugés par la factory ; le doublon — avec un autre
 * externe ou avec l'adresse d'une fiche déjà inscrite — par la liste. Rend
 * l'identifiant de la ligne.
 */
@CommandHandler(AddExternalDossierRecipientCommand)
export class AddExternalDossierRecipientHandler implements ICommandHandler<
  AddExternalDossierRecipientCommand,
  string
> {
  constructor(
    private readonly recipients: DossierRecipientsRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddExternalDossierRecipientCommand): Promise<string> {
    const recipient = DossierRecipient.ofExternal(
      {
        email: command.email,
        firstName: command.firstName,
        lastName: command.lastName,
        jobTitle: command.jobTitle,
      },
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

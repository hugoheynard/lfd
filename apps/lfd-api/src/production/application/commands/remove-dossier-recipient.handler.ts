import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DossierRecipientRemovedEvent } from "../../domain/events/dossier-recipient.events.js";
import { DossierRecipientsRepository } from "../../domain/ports/dossier-recipients.repository.js";
import { RemoveDossierRecipientCommand } from "./remove-dossier-recipient.command.js";

/**
 * **Retirer un destinataire** du dossier (plan `plan-envoi-du-dossier.md`, E2).
 *
 * 404 sur un id absent de la liste — déjà retiré compris : un retrait vise une
 * ligne précise, et l'écran doit savoir qu'il était périmé. La ligne
 * s'archive ; le journal dit qui, et à quelle adresse le dossier partait.
 */
@CommandHandler(RemoveDossierRecipientCommand)
export class RemoveDossierRecipientHandler implements ICommandHandler<
  RemoveDossierRecipientCommand,
  void
> {
  constructor(
    private readonly recipients: DossierRecipientsRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDossierRecipientCommand): Promise<void> {
    const now = this.clock.now();
    await this.uow.run(async () => {
      const list = await this.recipients.load();
      const removed = list.remove(command.recipientId, command.staffUserId, now);
      await this.recipients.save(list);
      await this.events.publishTraced(new DossierRecipientRemovedEvent(removed));
    });
  }
}

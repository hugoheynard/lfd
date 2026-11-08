import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MailSendNotFoundError } from "../../domain/errors/mail-sends.errors.js";
import { MailRecipientRevealedEvent } from "../../domain/mail-sends.events.js";
import { MailSendSubjects } from "../../domain/ports/mail-send-subjects.js";
import { StaffMailConsultationsRepository } from "../../domain/ports/staff-mail-consultations.repository.js";
import { RevealMailRecipientCommand } from "./reveal-mail-recipient.command.js";

/**
 * Révèle l'adresse d'un envoi : la ligne de révélation et le fait du journal
 * partent dans la même transaction, ou rien ne part. Le plafond horaire est
 * la règle de l'agrégat, lu sous un verrou par personne.
 */
@CommandHandler(RevealMailRecipientCommand)
export class RevealMailRecipientHandler implements ICommandHandler<
  RevealMailRecipientCommand,
  void
> {
  constructor(
    private readonly subjects: MailSendSubjects,
    private readonly consultations: StaffMailConsultationsRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {MailSendNotFoundError} l'envoi n'est pas au suivi.
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  async execute({ sendId, staffUserId }: RevealMailRecipientCommand): Promise<void> {
    const subject = await this.subjects.subjectOf(sendId);
    if (subject === null) {
      throw new MailSendNotFoundError(sendId);
    }
    const now = this.clock.now();
    await this.uow.run(async () => {
      const consultations = await this.consultations.load(staffUserId, now);
      consultations.reveal(this.ids.next(), sendId, now);
      await this.consultations.save(consultations);
      await this.events.publishTraced(
        new MailRecipientRevealedEvent(sendId, subject.template, subject.space),
      );
    });
  }
}

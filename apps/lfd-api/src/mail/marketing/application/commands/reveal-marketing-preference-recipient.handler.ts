import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import {
  MarketingPreferenceAddressErasedError,
  MarketingPreferenceNotFoundError,
} from "../../domain/errors/marketing-preference-admin.errors.js";
import { MarketingPreferenceRecipientRevealedEvent } from "../../domain/marketing-preference.events.js";
import { MarketingPreferenceAdminReader } from "../../domain/ports/marketing-preference-admin.reader.js";
import { PreferenceConsultationsRepository } from "../../domain/ports/preference-consultations.repository.js";
import { RevealMarketingPreferenceRecipientCommand } from "./reveal-marketing-preference-recipient.command.js";

/**
 * Affiche l'adresse d'une ligne du registre : une révélation de CETTE ligne
 * est rangée (`mail_preference_consultation`, jamais l'adresse), sous le
 * plafond horaire partagé avec le suivi ; le fait part au journal dans la
 * même transaction, ou rien ne part.
 */
@CommandHandler(RevealMarketingPreferenceRecipientCommand)
export class RevealMarketingPreferenceRecipientHandler implements ICommandHandler<
  RevealMarketingPreferenceRecipientCommand,
  void
> {
  constructor(
    private readonly preferences: MarketingPreferenceAdminReader,
    private readonly consultations: PreferenceConsultationsRepository,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /**
   * @throws {MarketingPreferenceNotFoundError} la ligne n'est pas au registre.
   * @throws {MarketingPreferenceAddressErasedError} l'adresse a été effacée.
   * @throws {MailConsultationLimitReachedError} 30 consultations dans l'heure.
   */
  async execute({
    preferenceId,
    staffUserId,
  }: RevealMarketingPreferenceRecipientCommand): Promise<void> {
    const state = await this.preferences.detail(preferenceId);
    if (state === null) {
      throw new MarketingPreferenceNotFoundError(preferenceId);
    }
    if (state.recipientKey === null) {
      throw new MarketingPreferenceAddressErasedError(preferenceId);
    }
    const now = this.clock.now();
    await this.uow.run(async () => {
      const consultations = await this.consultations.load(staffUserId, now);
      consultations.reveal(this.ids.next(), preferenceId, now);
      await this.consultations.save(consultations);
      await this.events.publishTraced(
        new MarketingPreferenceRecipientRevealedEvent(preferenceId, state.space),
      );
    });
  }
}

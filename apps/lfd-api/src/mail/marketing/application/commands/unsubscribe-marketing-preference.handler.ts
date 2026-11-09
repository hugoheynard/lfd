import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { MarketingPreferenceNotFoundError } from "../../domain/errors/marketing-preference-admin.errors.js";
import { MarketingUnsubscribedByStaffEvent } from "../../domain/marketing-preference.events.js";
import { MarketingPreferenceRepository } from "../../domain/ports/marketing-preference.repository.js";
import { UnsubscribeMarketingPreferenceCommand } from "./unsubscribe-marketing-preference.command.js";

/**
 * Charge la ligne, la désinscrit par l'agrégat (idempotent : une ligne déjà
 * désinscrite garde son premier instant et sa première source), la range, et
 * trace le geste — tout dans une transaction.
 */
@CommandHandler(UnsubscribeMarketingPreferenceCommand)
export class UnsubscribeMarketingPreferenceHandler implements ICommandHandler<
  UnsubscribeMarketingPreferenceCommand,
  void
> {
  constructor(
    private readonly preferences: MarketingPreferenceRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {MarketingPreferenceNotFoundError} la ligne n'est pas au registre. */
  async execute({ preferenceId }: UnsubscribeMarketingPreferenceCommand): Promise<void> {
    await this.uow.run(async () => {
      const preference = await this.preferences.loadById(preferenceId);
      if (preference === null) {
        throw new MarketingPreferenceNotFoundError(preferenceId);
      }
      const changed = preference.unsubscribe({ at: this.clock.now(), source: "staff" });
      if (changed) {
        await this.preferences.save(preference);
      }
      await this.events.publishTraced(
        new MarketingUnsubscribedByStaffEvent(preference.id, preference.space, changed),
      );
    });
  }
}

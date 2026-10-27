import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { StorefrontAllergenDisplayChangedEvent } from "../domain/storefront.events.js";
import { StorefrontSettingsRepository } from "../domain/storefront-settings.repository.js";
import { SetStorefrontAllergenDisplayCommand } from "./set-storefront-allergen-display.command.js";

/**
 * Pose la place des allergènes et la trace dans la même unité de travail —
 * la trace tombe avec le réglage qu'elle décrit. Une valeur inchangée ne
 * laisse aucune trace.
 */
@CommandHandler(SetStorefrontAllergenDisplayCommand)
export class SetStorefrontAllergenDisplayHandler implements ICommandHandler<
  SetStorefrontAllergenDisplayCommand,
  void
> {
  constructor(
    private readonly settings: StorefrontSettingsRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: SetStorefrontAllergenDisplayCommand): Promise<void> {
    await this.uow.run(async () => {
      const before = await this.settings.setAllergenDisplay(
        command.allergenDisplay,
        this.clock.now(),
        command.staffUserId,
      );
      if (before !== command.allergenDisplay) {
        await this.events.publishTraced(
          new StorefrontAllergenDisplayChangedEvent(before, command.allergenDisplay),
        );
      }
    });
  }
}

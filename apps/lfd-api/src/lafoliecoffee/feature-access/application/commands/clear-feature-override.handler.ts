import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { FeatureOverrideNotFoundError } from "../../domain/feature-access-errors.js";
import { FeatureOverrideClearedEvent } from "../../domain/feature-access.events.js";
import { FeatureOverrideRepository } from "../../domain/ports/feature-override.repository.js";
import { ClearFeatureOverrideCommand } from "./clear-feature-override.command.js";

/**
 * Supprime la dérogation — c'est le retour au défaut. La suppression est
 * physique parce qu'elle EST le geste ; la trace, elle, reste au journal.
 */
@CommandHandler(ClearFeatureOverrideCommand)
export class ClearFeatureOverrideHandler implements ICommandHandler<
  ClearFeatureOverrideCommand,
  void
> {
  constructor(
    private readonly overrides: FeatureOverrideRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ClearFeatureOverrideCommand): Promise<void> {
    await this.uow.run(async () => {
      const previous = await this.overrides.remove(command.key);
      if (previous === null) {
        throw new FeatureOverrideNotFoundError(command.key);
      }
      await this.events.publishTraced(new FeatureOverrideClearedEvent(command.key, previous));
    });
  }
}

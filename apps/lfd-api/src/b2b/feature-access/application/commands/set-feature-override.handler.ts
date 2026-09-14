import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { FeatureOverrideSetEvent } from "../../domain/feature-access.events.js";
import { FeatureOverride } from "../../domain/feature-override.js";
import { FeatureOverrideRepository } from "../../domain/ports/feature-override.repository.js";
import { authorOf } from "../feature-access-author.js";
import { SetFeatureOverrideCommand } from "./set-feature-override.command.js";

/**
 * Pose une dérogation. La factory refuse une clé ou une valeur hors catalogue
 * AVANT toute écriture ; l'écriture et sa trace partent ensemble.
 */
@CommandHandler(SetFeatureOverrideCommand)
export class SetFeatureOverrideHandler implements ICommandHandler<SetFeatureOverrideCommand, void> {
  constructor(
    private readonly overrides: FeatureOverrideRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: SetFeatureOverrideCommand): Promise<void> {
    const override = FeatureOverride.pose({
      key: command.key,
      value: command.value,
      at: this.clock.now(),
      author: await authorOf(this.staff, command.staffSub),
    });
    await this.uow.run(async () => {
      const previous = await this.overrides.put(override);
      await this.events.publishTraced(
        new FeatureOverrideSetEvent(override.key, override.value, previous),
      );
    });
  }
}

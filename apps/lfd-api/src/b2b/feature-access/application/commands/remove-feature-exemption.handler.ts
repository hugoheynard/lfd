import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { FeatureExemptionNotFoundError } from "../../domain/feature-access-errors.js";
import { FeatureExemptionRemovedEvent } from "../../domain/feature-access.events.js";
import { FeatureExemptionRepository } from "../../domain/ports/feature-exemption.repository.js";
import { RemoveFeatureExemptionCommand } from "./remove-feature-exemption.command.js";

/** Retire une exemption ; l'adresse retirée part au journal, la ligne disparaît. */
@CommandHandler(RemoveFeatureExemptionCommand)
export class RemoveFeatureExemptionHandler implements ICommandHandler<
  RemoveFeatureExemptionCommand,
  void
> {
  constructor(
    private readonly exemptions: FeatureExemptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveFeatureExemptionCommand): Promise<void> {
    await this.uow.run(async () => {
      const removed = await this.exemptions.remove(command.key, command.id);
      if (removed === null) {
        throw new FeatureExemptionNotFoundError(command.key, command.id);
      }
      await this.events.publishTraced(
        new FeatureExemptionRemovedEvent(command.key, command.id, removed.email),
      );
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { FeatureCompanyExemptionNotFoundError } from "../../domain/feature-access-errors.js";
import { FeatureCompanyExemptionEvent } from "../../domain/feature-access.events.js";
import { FeatureCompanyExemptionRepository } from "../../domain/ports/feature-company-exemption.repository.js";
import { RemoveFeatureCompanyExemptionCommand } from "./remove-feature-company-exemption.command.js";

/** Retire une société exemptée ; son nom figé part au journal, la ligne disparaît. */
@CommandHandler(RemoveFeatureCompanyExemptionCommand)
export class RemoveFeatureCompanyExemptionHandler implements ICommandHandler<
  RemoveFeatureCompanyExemptionCommand,
  void
> {
  constructor(
    private readonly exemptions: FeatureCompanyExemptionRepository,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  /** @throws {FeatureCompanyExemptionNotFoundError} la société n'est pas dans la liste. */
  async execute(command: RemoveFeatureCompanyExemptionCommand): Promise<void> {
    await this.uow.run(async () => {
      const removed = await this.exemptions.remove(command.key, command.companyId);
      if (removed === null) {
        throw new FeatureCompanyExemptionNotFoundError(command.key, command.companyId);
      }
      await this.events.publishTraced(
        FeatureCompanyExemptionEvent.removed(command.key, command.companyId, removed.companyName),
      );
    });
  }
}

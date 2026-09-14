import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { FeatureExemptionAddedEvent } from "../../domain/feature-access.events.js";
import { FeatureExemption } from "../../domain/feature-exemption.js";
import { FeatureExemptionRepository } from "../../domain/ports/feature-exemption.repository.js";
import { authorOf } from "../feature-access-author.js";
import { AddFeatureExemptionCommand } from "./add-feature-exemption.command.js";

/**
 * Exempte une adresse — **idempotent sur `(clé, adresse)`**.
 *
 * Une adresse déjà exemptée rend sa ligne existante, et ne laisse pas de
 * seconde trace : rien n'a changé, et un double clic ne doit pas faire croire à
 * deux gestes.
 */
@CommandHandler(AddFeatureExemptionCommand)
export class AddFeatureExemptionHandler implements ICommandHandler<
  AddFeatureExemptionCommand,
  string
> {
  constructor(
    private readonly exemptions: FeatureExemptionRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AddFeatureExemptionCommand): Promise<string> {
    const exemption = FeatureExemption.grant({
      id: this.ids.next(),
      key: command.key,
      email: command.email,
      at: this.clock.now(),
      author: await authorOf(this.staff, command.staffSub),
    });
    return this.uow.run(async () => {
      const outcome = await this.exemptions.addIfAbsent(exemption);
      if (outcome.created) {
        await this.events.publishTraced(
          new FeatureExemptionAddedEvent(exemption.key, outcome.id, exemption.email),
        );
      }
      return outcome.id;
    });
  }
}

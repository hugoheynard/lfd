import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { OrderOpeningExemptionNotFoundError } from "../../domain/errors/order-opening-exemption-errors.js";
import { OrderOpeningExemptionWithdrawnEvent } from "../../domain/order-opening-exemption.events.js";
import { OrderOpeningExemptionRepository } from "../../domain/ports/order-opening-exemption.repository.js";
import { WithdrawOrderOpeningExemptionCommand } from "./withdraw-order-opening-exemption.command.js";

/** Retire une exemption : charger, `withdraw()` (qui refuse un second retrait), enregistrer. */
@CommandHandler(WithdrawOrderOpeningExemptionCommand)
export class WithdrawOrderOpeningExemptionHandler implements ICommandHandler<
  WithdrawOrderOpeningExemptionCommand,
  void
> {
  constructor(
    private readonly exemptions: OrderOpeningExemptionRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WithdrawOrderOpeningExemptionCommand): Promise<void> {
    const stamp = { at: this.clock.now(), author: await authorOf(this.staff, command.staffUserId) };
    await this.uow.run(async () => {
      const exemption = await this.exemptions.load(command.exemptionId);
      if (exemption === null) {
        throw new OrderOpeningExemptionNotFoundError(command.exemptionId);
      }
      exemption.withdraw(stamp);
      await this.exemptions.save(exemption);
      await this.events.publishTraced(new OrderOpeningExemptionWithdrawnEvent(exemption));
    });
  }
}

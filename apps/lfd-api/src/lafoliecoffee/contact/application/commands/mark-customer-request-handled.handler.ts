import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { StaffDirectory } from "../../../account/domain/ports/staff-directory.js";
import { authorOf } from "../../../feature-access/application/feature-access-author.js";
import { CustomerRequestHandledEvent } from "../../domain/customer-request.events.js";
import { CustomerRequestNotFoundError } from "../../domain/errors/contact-errors.js";
import { CustomerRequestRepository } from "../../domain/ports/customer-request.repository.js";
import { MarkCustomerRequestHandledCommand } from "./mark-customer-request-handled.command.js";

/**
 * Marque une demande traitée, quel que soit son type : charger, `markHandled`
 * (qui refuse un second traitement), enregistrer — et le fait part avec
 * l'écriture, dans la même transaction.
 */
@CommandHandler(MarkCustomerRequestHandledCommand)
export class MarkCustomerRequestHandledHandler implements ICommandHandler<
  MarkCustomerRequestHandledCommand,
  void
> {
  constructor(
    private readonly requests: CustomerRequestRepository,
    private readonly staff: StaffDirectory,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkCustomerRequestHandledCommand): Promise<void> {
    const author = await authorOf(this.staff, command.staffUserId);
    await this.uow.run(async () => {
      const request = await this.requests.load(command.requestId);
      if (request === null) {
        throw new CustomerRequestNotFoundError(command.requestId);
      }
      request.markHandled(author, this.clock.now());
      await this.requests.save(request);
      await this.events.publishTraced(new CustomerRequestHandledEvent(request));
    });
  }
}

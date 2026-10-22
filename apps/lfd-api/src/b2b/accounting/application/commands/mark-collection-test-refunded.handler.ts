import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionTestNotFoundError } from "../../domain/errors/collection-test-errors.js";
import { CollectionTestRefundedEvent } from "../../domain/events/collection-test.events.js";
import { CollectionTestRepository } from "../../domain/ports/collection-test.repository.js";
import { MarkCollectionTestRefundedCommand } from "./mark-collection-test-refunded.command.js";

/** **« Marqué remboursé »** : l'agrégat refuse un second geste, ou un geste sans objet. */
@CommandHandler(MarkCollectionTestRefundedCommand)
export class MarkCollectionTestRefundedHandler implements ICommandHandler<
  MarkCollectionTestRefundedCommand,
  void
> {
  constructor(
    private readonly tests: CollectionTestRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: MarkCollectionTestRefundedCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const test = await this.tests.load(command.testId);
      if (test === null) {
        throw new CollectionTestNotFoundError(command.testId);
      }
      test.markRefunded(command.refundedOn, { at, staffId: command.staffUserId });
      await this.tests.save(test);
      await this.events.publishTraced(
        new CollectionTestRefundedEvent(test, command.refundedOn, at),
      );
    });
  }
}

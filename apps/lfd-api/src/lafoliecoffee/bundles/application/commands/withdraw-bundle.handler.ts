import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BundleWithdrawnEvent } from "../../domain/events/bundle.events.js";
import { BundleRepository } from "../../domain/ports/bundle.repository.js";
import { requireBundle, subjectOf } from "./bundle-writing.js";
import { WithdrawBundleCommand } from "./withdraw-bundle.command.js";

/** **Retire** une formule. Jamais de suppression : on la remet en brouillon pour la reprendre. */
@CommandHandler(WithdrawBundleCommand)
export class WithdrawBundleHandler implements ICommandHandler<WithdrawBundleCommand, void> {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: WithdrawBundleCommand): Promise<void> {
    const bundle = await requireBundle(this.bundles, command.key);
    bundle.withdraw({ by: command.writtenBy, at: this.clock.now() });

    await this.uow.run(async () => {
      await this.bundles.save(bundle);
      await this.events.publishTraced(new BundleWithdrawnEvent(subjectOf(bundle.snapshot())));
    });
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BundleReturnedToDraftEvent } from "../../domain/events/bundle.events.js";
import { BundleRepository } from "../../domain/ports/bundle.repository.js";
import { requireBundle, subjectOf } from "./bundle-writing.js";
import { ReturnBundleToDraftCommand } from "./return-bundle-to-draft.command.js";

/**
 * **Remet en brouillon** une formule retirée. Ses articles ne sont pas
 * rejugés : ils le seront s'ils sont ajoutés de nouveau, et l'écran signale
 * ceux que la boutique ne sert plus.
 */
@CommandHandler(ReturnBundleToDraftCommand)
export class ReturnBundleToDraftHandler implements ICommandHandler<
  ReturnBundleToDraftCommand,
  void
> {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReturnBundleToDraftCommand): Promise<void> {
    const bundle = await requireBundle(this.bundles, command.key);
    bundle.returnToDraft({ by: command.writtenBy, at: this.clock.now() });

    await this.uow.run(async () => {
      await this.bundles.save(bundle);
      await this.events.publishTraced(new BundleReturnedToDraftEvent(subjectOf(bundle.snapshot())));
    });
  }
}

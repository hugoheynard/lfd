import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { changesBetween } from "../../../../platform/journal/changes.js";
import { Clock } from "../../../../platform/time/clock.js";
import { BundlePresentationEditedEvent } from "../../domain/events/bundle.events.js";
import { BundleRepository } from "../../domain/ports/bundle.repository.js";
import { requireBundle, subjectOf } from "./bundle-writing.js";
import { EditBundlePresentationCommand } from "./edit-bundle-presentation.command.js";

/**
 * **Renomme et décrit** une formule. La clé ne suit pas le nom. Un geste sans
 * effet n'écrit rien et ne journalise rien.
 */
@CommandHandler(EditBundlePresentationCommand)
export class EditBundlePresentationHandler implements ICommandHandler<
  EditBundlePresentationCommand,
  void
> {
  constructor(
    private readonly bundles: BundleRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: EditBundlePresentationCommand): Promise<void> {
    const bundle = await requireBundle(this.bundles, command.key);
    const before = bundle.snapshot();
    const write = { by: command.writtenBy, at: this.clock.now() };
    bundle.rename(command.presentation.name, write);
    bundle.describe(command.presentation.description, write);
    const after = bundle.snapshot();
    const changes = changesBetween(
      { name: before.name, description: before.description },
      { name: after.name, description: after.description },
    );
    if (Object.keys(changes).length === 0) {
      return;
    }

    await this.uow.run(async () => {
      await this.bundles.save(bundle);
      await this.events.publishTraced(new BundlePresentationEditedEvent(subjectOf(after), changes));
    });
  }
}

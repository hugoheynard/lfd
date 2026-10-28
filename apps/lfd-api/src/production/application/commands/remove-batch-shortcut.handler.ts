import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { BatchShortcutNotFoundError } from "../../domain/errors/batch-shortcut-errors.js";
import { BatchShortcutRemovedEvent } from "../../domain/events/batch-shortcut.events.js";
import { BatchShortcutRepository } from "../../domain/ports/batch-shortcut.repository.js";
import { RemoveBatchShortcutCommand } from "./remove-batch-shortcut.command.js";

/**
 * **Supprimer un raccourci** (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1). 404 sur un raccourci inconnu ou déjà supprimé : un retrait vise une
 * ligne précise, et l'écran doit savoir qu'il était périmé. La ligne
 * s'archive ; son nom se libère pour un nouveau raccourci.
 */
@CommandHandler(RemoveBatchShortcutCommand)
export class RemoveBatchShortcutHandler implements ICommandHandler<
  RemoveBatchShortcutCommand,
  void
> {
  constructor(
    private readonly shortcuts: BatchShortcutRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveBatchShortcutCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const product = await this.shortcuts.loadHolding(command.shortcutId);
      if (product === null) {
        throw new BatchShortcutNotFoundError(command.shortcutId);
      }
      const removed = product.remove(command.shortcutId, at);
      await this.shortcuts.save(product);
      await this.events.publishTraced(new BatchShortcutRemovedEvent(removed));
    });
  }
}

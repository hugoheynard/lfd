import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { SellableArticlesReader } from "../../channels/commerce/sellable-articles.reader.js";
import { BatchShortcutNotFoundError } from "../../domain/errors/batch-shortcut-errors.js";
import { BatchShortcutUpdatedEvent } from "../../domain/events/batch-shortcut.events.js";
import { BatchShortcutRepository } from "../../domain/ports/batch-shortcut.repository.js";
import { saleUnitOfSku } from "./batch-shortcut-sale-unit.js";
import { UpdateBatchShortcutCommand } from "./update-batch-shortcut.command.js";

/**
 * **Modifier un raccourci** (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1). 404 sur un raccourci inconnu ou déjà supprimé. Reposer le même nom et
 * les mêmes pièces n'écrit ni ne journalise rien.
 */
@CommandHandler(UpdateBatchShortcutCommand)
export class UpdateBatchShortcutHandler implements ICommandHandler<
  UpdateBatchShortcutCommand,
  void
> {
  constructor(
    private readonly shortcuts: BatchShortcutRepository,
    private readonly events: DomainEventPublisher,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly articles: SellableArticlesReader,
  ) {}

  async execute(command: UpdateBatchShortcutCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const product = await this.shortcuts.loadHolding(command.shortcutId);
      if (product === null) {
        throw new BatchShortcutNotFoundError(command.shortcutId);
      }
      const change = product.update(
        command.shortcutId,
        { label: command.label, pieces: command.pieces },
        at,
        await saleUnitOfSku(this.articles, product.sku),
      );
      if (change === null) {
        return;
      }
      await this.shortcuts.save(product);
      await this.events.publishTraced(
        new BatchShortcutUpdatedEvent(change.shortcut, change.previous),
      );
    });
  }
}

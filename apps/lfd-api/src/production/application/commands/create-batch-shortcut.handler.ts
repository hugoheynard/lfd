import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { SellableArticlesReader } from "../../channels/commerce/sellable-articles.reader.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { BatchShortcutCreatedEvent } from "../../domain/events/batch-shortcut.events.js";
import { BatchShortcutRepository } from "../../domain/ports/batch-shortcut.repository.js";
import { saleUnitOfSku } from "./batch-shortcut-sale-unit.js";
import { CreateBatchShortcutCommand } from "./create-batch-shortcut.command.js";

/**
 * **Ajouter un raccourci** à un produit (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1). L'agrégat du produit, chargé sous verrou, juge la saisie, le plafond
 * et le doublon ; l'écriture et son fait partent ensemble — un journal en
 * panne annule l'ajout. Rend l'identifiant du raccourci.
 */
@CommandHandler(CreateBatchShortcutCommand)
export class CreateBatchShortcutHandler implements ICommandHandler<
  CreateBatchShortcutCommand,
  string
> {
  constructor(
    private readonly shortcuts: BatchShortcutRepository,
    private readonly authors: StaffAuthorDirectory,
    private readonly events: DomainEventPublisher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
    private readonly articles: SellableArticlesReader,
  ) {}

  async execute(command: CreateBatchShortcutCommand): Promise<string> {
    const id = this.ids.next();
    const at = this.clock.now();
    const saleUnit = await saleUnitOfSku(this.articles, command.sku);
    await this.uow.run(async () => {
      const product = await this.shortcuts.loadForSku(command.sku);
      const authors = await this.authors.identify([command.staffUserId]);
      const shortcut = product.add({
        id,
        terms: { label: command.label, pieces: command.pieces },
        saleUnit,
        author: { staffUserId: command.staffUserId, name: authors.nameOf(command.staffUserId) },
        at,
      });
      await this.shortcuts.save(product);
      await this.events.publishTraced(new BatchShortcutCreatedEvent(shortcut));
    });
    return id;
  }
}

import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ImportEntryNotRecordableError } from "../../domain/errors/bank-return-file-errors.js";
import { CollectionReturnRepository } from "../../domain/ports/collection-return.repository.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { readBankReturnFile } from "../../domain/services/bank-return-file.js";
import { classifyReturns, returnEntryOf } from "../collection-return-import-support.js";
import { recordReturn } from "../collection-return-support.js";
import { ConfirmCollectionReturnImportCommand } from "./confirm-collection-return-import.command.js";

/**
 * **Confirme un import de retours** (R5b) : relit le fichier, apparie de
 * nouveau, et enregistre chaque transaction retenue par le MÊME chemin que la
 * saisie à la main. Tout ou rien, dans une transaction : une transaction
 * retenue qui ne s'enregistrerait plus (le monde a bougé depuis l'aperçu)
 * refuse l'ensemble, en la nommant.
 */
@CommandHandler(ConfirmCollectionReturnImportCommand)
export class ConfirmCollectionReturnImportHandler implements ICommandHandler<
  ConfirmCollectionReturnImportCommand,
  readonly string[]
> {
  constructor(
    private readonly returns: CollectionReturnRepository,
    private readonly lines: ReturnableLinesReader,
    private readonly orders: OrderCollectionRepository,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ConfirmCollectionReturnImportCommand): Promise<readonly string[]> {
    const file = readBankReturnFile(command.xml);
    const at = this.clock.now();
    const retained = new Set(command.endToEndIds);
    return this.uow.run(async () => {
      const classified = await classifyReturns(this.lines, file, at);
      const chosen = classified.filter((item) => retained.has(item.entry.endToEndId));
      const missing = [...retained].find(
        (id) => !classified.some((item) => item.entry.endToEndId === id),
      );
      if (missing !== undefined) {
        throw new ImportEntryNotRecordableError(missing, "elle n'est pas dans ce fichier");
      }
      const writers = {
        returns: this.returns,
        lines: this.lines,
        orders: this.orders,
        events: this.events,
      };
      const recorded: string[] = [];
      for (const item of chosen) {
        if (item.status !== "matched" || item.line === null) {
          throw new ImportEntryNotRecordableError(
            item.entry.endToEndId,
            item.problem ?? item.status,
          );
        }
        const bankReturn = await recordReturn(
          writers,
          item.line,
          returnEntryOf(item.entry, item.reason, file.format),
          { id: this.ids.next(), recorded: { at, staffId: command.staffUserId } },
        );
        recorded.push(bankReturn.id);
      }
      return recorded;
    });
  }
}

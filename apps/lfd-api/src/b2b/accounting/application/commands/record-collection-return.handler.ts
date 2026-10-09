import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../../platform/id/id-generator.js";
import { Clock } from "../../../../platform/time/clock.js";
import { ReturnableLineNotFoundError } from "../../domain/errors/collection-return-errors.js";
import { CollectionReturnRepository } from "../../domain/ports/collection-return.repository.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { recordReturn } from "../collection-return-support.js";
import { RecordCollectionReturnCommand } from "./record-collection-return.command.js";

/**
 * **« Signaler un retour »** depuis l'écran du lot (R5a). La ligne est
 * désignée par son lot et son rang ; le montant est le sien (règle de
 * l'agrégat). Ses commandes quittent `collected` : elles ne sont plus
 * prélevées, et aucune ne repart seule au lot suivant.
 */
@CommandHandler(RecordCollectionReturnCommand)
export class RecordCollectionReturnHandler implements ICommandHandler<
  RecordCollectionReturnCommand,
  string
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

  async execute(command: RecordCollectionReturnCommand): Promise<string> {
    const at = this.clock.now();
    return this.uow.run(async () => {
      const line = await this.lines.lineOf(command.batchId, command.rank);
      if (line === null) {
        throw new ReturnableLineNotFoundError(`${command.batchId} · ligne ${command.rank}`);
      }
      const writers = {
        returns: this.returns,
        lines: this.lines,
        orders: this.orders,
        events: this.events,
      };
      const bankReturn = await recordReturn(
        writers,
        line,
        {
          kind: command.kind,
          reasonCode: command.reasonCode,
          reasonLabel: command.reasonLabel,
          returnedOn: command.returnedOn,
          amountCents: line.amountCents,
          feeCents: command.feeCents,
          source: "manual",
        },
        { id: this.ids.next(), recorded: { at, staffId: command.staffUserId } },
      );
      return bankReturn.id;
    });
  }
}

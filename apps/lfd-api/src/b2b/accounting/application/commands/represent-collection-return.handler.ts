import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { CollectionReturnResolvedEvent } from "../../domain/events/collection-return.events.js";
import { CollectionReturnRepository } from "../../domain/ports/collection-return.repository.js";
import { MandateRecheckReader } from "../../domain/ports/mandate-recheck.reader.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";
import { ReturnableLinesReader } from "../../domain/ports/returnable-lines.reader.js";
import { loadReturnWithLine } from "../collection-return-support.js";
import { RepresentCollectionReturnCommand } from "./represent-collection-return.command.js";

/**
 * **Re-présenter** : les commandes de la ligne repassent `due` et entreront
 * au lot suivant NORMAL, avec son préavis et un avis qui dit « nouvelle
 * présentation ». Le mandat figé sur la ligne est relu ici (`debitable()`,
 * côté `payments`) : un mandat qui n'est plus actif refuse — il faut une
 * nouvelle signature. L'agrégat refuse aussi une ligne d'arrêté et un
 * mandat ponctuel.
 */
@CommandHandler(RepresentCollectionReturnCommand)
export class RepresentCollectionReturnHandler implements ICommandHandler<
  RepresentCollectionReturnCommand,
  void
> {
  constructor(
    private readonly returns: CollectionReturnRepository,
    private readonly lines: ReturnableLinesReader,
    private readonly orders: OrderCollectionRepository,
    private readonly mandates: MandateRecheckReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RepresentCollectionReturnCommand): Promise<void> {
    const at = this.clock.now();
    await this.uow.run(async () => {
      const { bankReturn, line } = await loadReturnWithLine(
        this.returns,
        this.lines,
        command.returnId,
      );
      const mandate = (await this.mandates.currentOf([line.mandateId])).get(line.mandateId);
      bankReturn.represent({ at, staffId: command.staffUserId }, line, mandate?.active === true);
      const orders = await this.orders.ofLine(line.batchId, line.rank);
      for (const order of orders) {
        order.represent(at);
      }
      await this.returns.save(bankReturn);
      await this.orders.saveAll(orders);
      await this.events.publishTraced(new CollectionReturnResolvedEvent(bankReturn, line, at));
    });
  }
}

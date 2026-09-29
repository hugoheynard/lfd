import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import {
  citeOrder,
  DeliveryRoundReorderedEvent,
} from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { loadRoundAt, referencesOf } from "../delivery-round-support.js";
import { ReorderDeliveryRoundCommand } from "./reorder-delivery-round.command.js";

/**
 * Range les arrêts d'une tournée dans l'ordre donné — la liste COMPLÈTE,
 * permutation exacte des arrêts vivants (I2). Un ordre identique n'écrit rien :
 * ni la tournée, ni sa version, ni le journal (C7).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {InvalidStopOrderError} @throws {DeliveryStopClosedError}
 */
@CommandHandler(ReorderDeliveryRoundCommand)
export class ReorderDeliveryRoundHandler implements ICommandHandler<
  ReorderDeliveryRoundCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ReorderDeliveryRoundCommand): Promise<void> {
    const { stopIds, version } = command.payload;
    await this.uow.run(async () => {
      const round = await loadRoundAt(this.rounds, command.roundId, version);
      const before = round.orderIds;
      if (!round.reorder(stopIds, this.clock.now())) {
        return;
      }
      await this.rounds.save(round);
      const references = await referencesOf(this.orders, before);
      const cite = (orderId: string) => citeOrder(orderId, references);
      await this.events.publishTraced(
        new DeliveryRoundReorderedEvent(round, before.map(cite), round.orderIds.map(cite)),
      );
    });
  }
}

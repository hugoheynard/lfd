import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { ensureServiceDayNotPast } from "../../domain/services/composable-day.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import {
  citeOrder,
  DeliveryRoundReorderedEvent,
} from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { withTransferStopsInPlace } from "../../domain/services/transfer-stops-in-place.js";
import { loadRoundAt, referencesOf } from "../delivery-round-support.js";
import { ReorderDeliveryRoundCommand } from "./reorder-delivery-round.command.js";

/**
 * Range les arrêts d'une tournée dans l'ordre donné — la liste COMPLÈTE,
 * permutation exacte des arrêts vivants (I2) ; un arrêt de transfert interne
 * omis garde sa place (lot T1). Un ordre identique n'écrit rien :
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
      const now = this.clock.now();
      // Une journée passée ne se réordonne plus (2026-10-26).
      ensureServiceDayNotPast(round.serviceDay, instantToLocal(now).day);
      const before = round.orderIds;
      // L'écran ne range que les commandes : un arrêt de transfert qu'il ne
      // cite pas garde son rang (plan du transfert interne, §5).
      const complete = withTransferStopsInPlace(round.liveStops, stopIds);
      if (!round.reorder(complete, now)) {
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

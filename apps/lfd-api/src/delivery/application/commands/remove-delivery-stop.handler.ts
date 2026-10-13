import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { citeOrder, DeliveryStopRemovedEvent } from "../../domain/events/delivery-round.events.js";
import { TransferStopRemovedEvent } from "../../domain/events/internal-transfer.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { InternalTransferRepository } from "../../domain/ports/internal-transfer.repository.js";
import { loadRoundAt, referencesOf } from "../delivery-round-support.js";
import { loadTransfer } from "../internal-transfer-support.js";
import { RemoveDeliveryStopCommand } from "./remove-delivery-stop.command.js";

/**
 * Retire un arrêt de sa tournée — à la main (Q11), y compris une commande
 * annulée ou qui n'est plus de ce jour. La ligne reste, `removed_at` posé : la
 * commande est libérée pour une autre tournée. Permis même si le véhicule a
 * été retiré depuis : c'est le geste de sortie de ce cas-là.
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryStopNotFoundError} @throws {DeliveryStopClosedError}
 */
@CommandHandler(RemoveDeliveryStopCommand)
export class RemoveDeliveryStopHandler implements ICommandHandler<RemoveDeliveryStopCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly transfers: InternalTransferRepository,
  ) {}

  async execute(command: RemoveDeliveryStopCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await loadRoundAt(this.rounds, command.roundId, command.payload.version);
      const stop = round.remove(command.stopId, this.clock.now());
      await this.rounds.save(round);
      if (stop.kind === "transfer") {
        // Le transfert redevient sans arrêt : réaffecté à la main, ou reçu à
        // la main au site (T2). Il reste prévu.
        const transfer = await loadTransfer(this.transfers, stop.transferId);
        await this.events.publishTraced(new TransferStopRemovedEvent(round, transfer));
        return;
      }
      const references = await referencesOf(this.orders, [stop.orderId]);
      await this.events.publishTraced(
        new DeliveryStopRemovedEvent(round, citeOrder(stop.orderId, references)),
      );
    });
  }
}

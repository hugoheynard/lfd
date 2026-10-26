import { instantToLocal } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import type { DeliveryRound, DetachedStop } from "../../domain/entities/delivery-round.js";
import { orderIdsOf } from "../../domain/entities/delivery-round-state.js";
import { citeOrder, DeliveryRoundRemovedEvent } from "../../domain/events/delivery-round.events.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { InternalTransferRepository } from "../../domain/ports/internal-transfer.repository.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { referencesOf } from "../delivery-round-support.js";
import { loadTransfer } from "../internal-transfer-support.js";
import { RemoveDeliveryRoundCommand } from "./remove-delivery-round.command.js";

/**
 * **« Supprimer la tournée »** (décision de Hugo, 2026-10-26) — une tournée
 * créée par erreur. Ses arrêts retournent à répartir le jour même — leurs
 * lignes prennent `removed_at`, comme un arrêt retiré à la main, et un
 * transfert redevient sans arrêt, réaffectable ; la tournée prend
 * `removed_at` et sort des lectures du jour. Jamais de suppression physique.
 * UN fait au journal, qui cite ce qui retourne à répartir.
 *
 * La tournée est verrouillée comme au départ AVANT de lire ses bacs chargés :
 * un chargement la verrouille en partage, donc il est passé (et se voit) ou
 * il attend la fin de ce geste (et trouve ses arrêts retirés).
 *
 * Rejouée sur une tournée déjà supprimée : sans effet, rien ne s'inscrit —
 * avant même la version, que la suppression a fait avancer.
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError} @throws {PastServiceDayCompositionError}
 * @throws {LoadedRoundRemovalError}
 */
@CommandHandler(RemoveDeliveryRoundCommand)
export class RemoveDeliveryRoundHandler implements ICommandHandler<
  RemoveDeliveryRoundCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly loadedStops: LoadedStopsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly transfers: InternalTransferRepository,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: RemoveDeliveryRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDeparture(command.roundId);
      if (round === null) {
        throw new DeliveryRoundNotFoundError(command.roundId);
      }
      if (round.removedAt !== null) {
        return;
      }
      round.ensureVersion(command.payload.version);
      const loaded = await this.loadedStops.loadedAmong(round.liveStops.map((stop) => stop.id));
      const now = this.clock.now();
      const stops = round.removeRound(now, instantToLocal(now).day, loaded);
      await this.rounds.save(round);
      await this.events.publishTraced(await this.factOf(round, stops));
    });
  }

  /** Les commandes citées par leur numéro, les transferts par leur site. */
  private async factOf(
    round: DeliveryRound,
    stops: readonly DetachedStop[],
  ): Promise<DeliveryRoundRemovedEvent> {
    const references = await referencesOf(this.orders, orderIdsOf(stops));
    const transfers = [];
    for (const stop of stops) {
      if (stop.kind === "transfer") {
        const transfer = await loadTransfer(this.transfers, stop.transferId);
        transfers.push({ id: transfer.id, name: transfer.siteLabel });
      }
    }
    const orders = orderIdsOf(stops).map((orderId) => citeOrder(orderId, references));
    return new DeliveryRoundRemovedEvent(round, orders, transfers);
  }
}

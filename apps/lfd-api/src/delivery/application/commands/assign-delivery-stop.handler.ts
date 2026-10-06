import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { type DeliveryOrderFacts, DeliveryOrdersReader } from "../../channels/commerce/index.js";
import type { DeliveryRound } from "../../domain/entities/delivery-round.js";
import {
  OrderAlreadyInRoundError,
  OrderNotAssignableError,
  type UnassignableReason,
} from "../../domain/errors/delivery-round-errors.js";
import { DeliveryStopAssignedEvent } from "../../domain/events/delivery-round.events.js";
import { BroughtBackOrdersReader } from "../../domain/ports/brought-back-orders.reader.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { ensureRoundVehicleActive, loadRoundAt } from "../delivery-round-support.js";
import { AssignDeliveryStopCommand } from "./assign-delivery-stop.command.js";

/**
 * Affecte une commande à une tournée : elle s'ajoute en dernier, ou après les
 * `after` premiers arrêts — « Placer ici », la place suggérée (CA7), sous la
 * version lue avec la suggestion.
 *
 * La commande doit être une livraison attendue CE jour-là, non annulée — lue
 * par le canal du commerce, au moment du geste. Une commande RAPPORTÉE (B3,
 * LB-Q2) entre dans une tournée de n'importe quel jour, sans que sa date
 * demandée change : c'est le commerce, et la promesse au client (lot RL1). Et dans aucune tournée
 * vivante, tous jours confondus (I3) : lue d'abord pour nommer la tournée qui
 * la porte, tenue ensuite par l'index si une affectation concurrente passe
 * entre les deux.
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {VehicleInactiveOnDayError} @throws {OrderNotAssignableError}
 * @throws {OrderAlreadyInRoundError} @throws {InvalidStopPositionError}
 */
@CommandHandler(AssignDeliveryStopCommand)
export class AssignDeliveryStopHandler implements ICommandHandler<
  AssignDeliveryStopCommand,
  string
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly vehicles: VehicleRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: AssignDeliveryStopCommand): Promise<string> {
    const { orderId, version, after } = command.payload;
    return this.uow.run(async () => {
      const round = await loadRoundAt(this.rounds, command.roundId, version);
      await ensureRoundVehicleActive(this.vehicles, round);
      const reference = await this.assignableReference(round, orderId);
      const stopId = this.ids.next();
      round.assign(stopId, orderId, this.clock.now(), after);
      await this.rounds.save(round);
      await this.events.publishTraced(
        new DeliveryStopAssignedEvent(
          round,
          { id: orderId, name: reference },
          round.positionOf(stopId),
        ),
      );
      return stopId;
    });
  }

  /** @throws {OrderNotAssignableError} @throws {OrderAlreadyInRoundError} */
  private async assignableReference(round: DeliveryRound, orderId: string): Promise<string> {
    const [[order], broughtBack] = await Promise.all([
      this.orders.byIds([orderId]),
      this.broughtBack.lastAmong([orderId]),
    ]);
    const anyDay = broughtBack.has(orderId);
    const reason =
      order === undefined ? "unknown" : unassignableReason(order, round.serviceDay, anyDay);
    const reference = order?.reference ?? orderId;
    if (reason !== null) {
      throw new OrderNotAssignableError(reference, round.serviceDay, reason);
    }
    const holder = await this.rounds.liveHolderOf(orderId);
    if (holder !== null) {
      throw new OrderAlreadyInRoundError(reference, holder);
    }
    return reference;
  }
}

/**
 * Ce qui empêche une commande d'entrer dans une tournée de ce jour, ou `null`.
 * `anyDay` : rapportée, elle n'est plus tenue à son jour demandé (lot RL1).
 */
function unassignableReason(
  order: DeliveryOrderFacts,
  day: string,
  anyDay: boolean,
): UnassignableReason | null {
  if (order.status === "cancelled") {
    return "cancelled";
  }
  if (!order.delivery) {
    return "not_delivery";
  }
  return order.day === day || anyDay ? null : "not_this_day";
}

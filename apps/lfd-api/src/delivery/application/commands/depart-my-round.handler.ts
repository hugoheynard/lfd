import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DepartureHoldsReader } from "../../channels/handover/index.js";
import type { DeliveryRound } from "../../domain/entities/delivery-round.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import type { DeliveryRoundDepartedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DoorstepSettingsReader } from "../../domain/ports/doorstep-settings.reader.js";
import { DepartedStopRepository } from "../../domain/ports/departed-stop.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { departAndFreeze } from "../delivery-departure-support.js";
import { asDriverRefusal } from "../driver-refusals.js";
import { DepartMyRoundCommand } from "./depart-my-round.command.js";

/**
 * **« Commencer ma tournée »** — la porte du LIVREUR (plan « Ma tournée »,
 * MT-Q1, MT-D3 v2). Le même geste que « Partir » du chargeur, le même
 * `depart` de l'agrégat, la même suite figée (`departAndFreeze`) — mais une
 * commande à part, parce que le chargement de la tournée porte le MUR :
 * `loadForDriverDeparture(roundId, staffUserId)` ne verrouille et ne rend que
 * la tournée dont il est le livreur affecté. Une tournée d'un autre, ou sans
 * livreur, est un 404 qui ne confirme rien.
 *
 * Les refus du domaine sont redits avec les phrases du livreur
 * (`asDriverRefusal`) : il ne charge pas, il appelle le dépôt.
 *
 * @throws {DriverRoundNotFoundError} @throws {DriverRoundStaleError}
 * @throws {DriverRoundDepartedError} @throws {DriverRoundNotReadyError}
 * @throws {DriverSharedBinToRedoError} @throws {DriverRoundBlockedError}
 */
@CommandHandler(DepartMyRoundCommand)
export class DepartMyRoundHandler implements ICommandHandler<DepartMyRoundCommand, void> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly departedStops: DepartedStopRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly holds: DepartureHoldsReader,
    private readonly doorstepSettings: DoorstepSettingsReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
  ) {}

  async execute(command: DepartMyRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDriverDeparture(command.roundId, command.staffUserId);
      if (round === null) {
        throw new DriverRoundNotFoundError();
      }
      const departed = await this.departAsDriver(round, command.payload.version);
      await this.events.publishTraced(departed);
    });
  }

  private async departAsDriver(
    round: DeliveryRound,
    version: number,
  ): Promise<DeliveryRoundDepartedEvent> {
    try {
      round.ensureVersion(version);
      return await departAndFreeze(round, {
        rounds: this.rounds,
        loadings: this.loadings,
        departedStops: this.departedStops,
        orders: this.orders,
        holds: this.holds,
        doorstepSettings: this.doorstepSettings,
        clock: this.clock,
        durable: this.durable,
      });
    } catch (error) {
      throw await asDriverRefusal(error, this.orders, round.orderIds);
    }
  }
}

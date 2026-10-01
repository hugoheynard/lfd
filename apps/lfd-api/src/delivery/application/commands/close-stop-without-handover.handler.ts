import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrderStatesReader, DeliveryOrdersReader } from "../../channels/commerce/index.js";
import type { DeliveryRound } from "../../domain/entities/delivery-round.js";
import {
  DoorstepStopNotFoundError,
  StopStillToHandOverError,
} from "../../domain/errors/delivery-doorstep-errors.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import {
  citeStopOrder,
  type ClosedWithoutHandoverCause,
  DeliveryStopClosedWithoutHandoverEvent,
} from "../../domain/events/delivery-doorstep.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { ensureFreshForDriver } from "../doorstep-support.js";
import { CloseStopWithoutHandoverCommand } from "./close-stop-without-handover.command.js";

/**
 * **Clore un arrêt sans remise** (`documentation/livraisons/plan-a-la-porte.md`,
 * AP-D2, L6-C11) — la commande a été retirée au comptoir, ou annulée, pendant
 * la tournée. Sans ce geste, l'arrêt ne se fermerait jamais, et l'index des
 * arrêts vivants garderait la commande pour toujours.
 *
 * Dans UNE unité de travail :
 * 1. la tournée est chargée et verrouillée SOUS LE MUR du livreur ;
 * 2. un arrêt déjà clos répond « déjà fait » (AP-D6) — AVANT la version, qui
 *    a avancé à la première clôture : le nouvel essai après une perte de
 *    réseau ne doit pas se lire comme un conflit ;
 * 3. la version présentée est vérifiée ;
 * 4. le commerce dit où en est la commande — encore à remettre : 409 nommé ;
 * 5. `closeStop` sur l'agrégat (l'exception écrite à I6), `save`, le fait.
 *
 * Aucune attestation, aucune remise : la commande n'est pas touchée.
 *
 * @throws {DriverRoundNotFoundError} @throws {DoorstepStopNotFoundError}
 * @throws {DoorstepRoundStaleError} @throws {StopStillToHandOverError}
 * @throws {DoorstepRoundNotDepartedError} @throws {DeliveryRoundReturnedError}
 */
@CommandHandler(CloseStopWithoutHandoverCommand)
export class CloseStopWithoutHandoverHandler implements ICommandHandler<
  CloseStopWithoutHandoverCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly states: DeliveryOrderStatesReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: CloseStopWithoutHandoverCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDriver(command.roundId, command.staffUserId);
      if (round === null) {
        throw new DriverRoundNotFoundError();
      }
      if (round.hasClosed(command.stopId)) {
        return;
      }
      // Rentrée, la tournée ne prend plus de geste (PL2) — dit avant la version,
      // que le retour a fait avancer.
      round.ensureOnTheRoad();
      ensureFreshForDriver(round, command.payload.version);
      const orderId = orderOfLiveStop(round, command.stopId);
      const [cause, reference] = await this.causeOf(orderId);
      round.closeStop(command.stopId, this.clock.now());
      await this.rounds.save(round);
      await this.events.publishTraced(
        new DeliveryStopClosedWithoutHandoverEvent(round, citeStopOrder(orderId, reference), cause),
      );
    });
  }

  /** Retirée ou annulée, et son numéro ; encore à remettre : le refus le nomme. */
  private async causeOf(orderId: string): Promise<[ClosedWithoutHandoverCause, string]> {
    const [states, facts] = await Promise.all([
      this.states.statesOf([orderId]),
      this.orders.byIds([orderId]),
    ]);
    const reference = facts[0]?.reference ?? "";
    const state = states[0]?.state ?? "open";
    if (state === "open") {
      throw new StopStillToHandOverError(reference === "" ? orderId : reference);
    }
    return [state, reference];
  }
}

/** La commande d'un arrêt vivant de la tournée — sinon il n'est pas à elle. */
function orderOfLiveStop(round: DeliveryRound, stopId: string): string {
  const stop = round.liveStops.find((candidate) => candidate.id === stopId);
  if (stop === undefined) {
    throw new DoorstepStopNotFoundError();
  }
  return stop.orderId;
}

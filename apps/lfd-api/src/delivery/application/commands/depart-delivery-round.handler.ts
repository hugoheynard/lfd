import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import type { StopReadiness } from "../../domain/entities/departure-readiness.js";
import { departedStopsOf } from "../../domain/entities/departure-sheet.js";
import type { StopLoading } from "../../domain/entities/stop-loading.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryRoundDepartedEvent } from "../../domain/events/delivery-loading.events.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DepartedStopRepository } from "../../domain/ports/departed-stop.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { DepartDeliveryRoundCommand } from "./depart-delivery-round.command.js";

/**
 * **« Partir »** (lot 4, L4-C4, Q14) — une seule transaction :
 *
 * 1. la tournée est verrouillée, puis — après elle — les lignes de chargement
 *    de ses arrêts, dans l'ordre de leur identifiant : aucun sac ne se charge,
 *    ne se décharge ni ne s'annule pendant qu'on décide ;
 * 2. la tournée refuse de partir tant qu'un arrêt vivant n'est pas chargé
 *    (non étiqueté ou partiel, L4-C17), en listant les références ;
 * 3. elle pose `departed_at` (écrivain : la tournée) ; l'exécution FIGE, pour
 *    chaque arrêt, ce que verra le livreur, lu au commerce à cet instant.
 *
 * Après, plus rien ne se compose ni ne se charge (I6).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryRoundNotReadyError}
 * @throws {DepartureSheetMissingError} @throws {DepartureOrderCancelledError}
 * @throws {EmptyDeliveryRoundError}
 */
@CommandHandler(DepartDeliveryRoundCommand)
export class DepartDeliveryRoundHandler implements ICommandHandler<
  DepartDeliveryRoundCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly loadings: StopLoadingRepository,
    private readonly departedStops: DepartedStopRepository,
    private readonly orders: DeliveryOrdersReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: DepartDeliveryRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDeparture(command.roundId);
      if (round === null) {
        throw new DeliveryRoundNotFoundError(command.roundId);
      }
      round.ensureVersion(command.payload.version);
      const loadings = await this.loadings.forRound(round);
      const sheets = await this.orders.departureSheetsOf(round.orderIds);
      const references = new Map(sheets.map((sheet) => [sheet.orderId, sheet.reference]));
      const at = this.clock.now();
      round.depart(at, readinessOf(loadings, references));
      const departed = departedStopsOf(round, at, sheets);
      await this.rounds.save(round);
      await this.departedStops.record(departed);
      await this.events.publishTraced(
        new DeliveryRoundDepartedEvent(round, liveBagCount(loadings)),
      );
    });
  }
}

function readinessOf(
  loadings: readonly StopLoading[],
  references: ReadonlyMap<string, string>,
): readonly StopReadiness[] {
  return loadings.map((loading) => ({
    stopId: loading.stopId,
    reference: references.get(loading.orderId) ?? loading.orderId,
    state: loading.state,
  }));
}

/** Les sacs non annulés qui partent — tous chargés, puisque la tournée est partie. */
function liveBagCount(loadings: readonly StopLoading[]): number {
  return loadings.reduce((sum, loading) => sum + loading.liveBagCount, 0);
}

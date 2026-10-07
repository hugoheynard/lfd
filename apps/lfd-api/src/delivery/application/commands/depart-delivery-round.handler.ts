import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { DurablePublisher } from "../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DepartureHoldsReader } from "../../channels/handover/index.js";
import { DeliveryRoundNotFoundError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DoorstepSettingsReader } from "../../domain/ports/doorstep-settings.reader.js";
import { DepartedStopRepository } from "../../domain/ports/departed-stop.repository.js";
import { StopLoadingRepository } from "../../domain/ports/stop-loading.repository.js";
import { departAndFreeze } from "../delivery-departure-support.js";
import { DepartDeliveryRoundCommand } from "./depart-delivery-round.command.js";

/**
 * **« Partir »** (lot 4, L4-C4, Q14) — la porte du CHARGEUR, une seule
 * transaction :
 *
 * 1. la tournée est verrouillée, puis — après elle — les lignes de chargement
 *    de ses arrêts, dans l'ordre de leur identifiant : aucun bac ne se charge,
 *    ne se décharge ni ne s'annule pendant qu'on décide ;
 * 2. la tournée refuse de partir tant qu'un arrêt vivant n'est pas chargé
 *    (non étiqueté ou partiel, L4-C17), en listant les références — ou qu'il
 *    porte un bac partagé « à refaire » (lot 4 bis, v2-4), en le nommant ;
 * 3. elle pose `departed_at` (écrivain : la tournée) ; l'exécution FIGE, pour
 *    chaque arrêt, ce que verra le livreur, lu au commerce à cet instant — et,
 *    depuis le 2026-10-01, son rang de passage et son point GPS (plan « Ma
 *    tournée », MT-D5 v2).
 *
 * Elle n'exige PAS de livreur affecté (MT-Q5 tranchée) : un livreur absent, un
 * départ décidé au dépôt. La porte du livreur est `DepartMyRoundHandler`.
 *
 * Après, plus rien ne se compose ni ne se charge (I6).
 *
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError} @throws {DeliveryRoundNotReadyError}
 * @throws {DepartureSheetMissingError} @throws {DepartureOrderCancelledError}
 * @throws {DepartureOrderHeldError}
 * @throws {EmptyDeliveryRoundError} @throws {SharedBinToRedoError}
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
    private readonly holds: DepartureHoldsReader,
    private readonly doorstepSettings: DoorstepSettingsReader,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
    private readonly durable: DurablePublisher,
    private readonly holders: StaffPermissionHolders,
  ) {}

  async execute(command: DepartDeliveryRoundCommand): Promise<void> {
    await this.uow.run(async () => {
      const round = await this.rounds.loadForDeparture(command.roundId);
      if (round === null) {
        throw new DeliveryRoundNotFoundError(command.roundId);
      }
      round.ensureVersion(command.payload.version);
      const departed = await departAndFreeze(round, {
        rounds: this.rounds,
        loadings: this.loadings,
        departedStops: this.departedStops,
        orders: this.orders,
        holds: this.holds,
        doorstepSettings: this.doorstepSettings,
        clock: this.clock,
        durable: this.durable,
        holders: this.holders,
      });
      await this.events.publishTraced(departed);
    });
  }
}

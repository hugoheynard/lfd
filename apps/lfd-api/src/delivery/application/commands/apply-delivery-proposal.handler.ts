import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { DomainEventPublisher } from "../../../platform/events/domain-event-publisher.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryRound } from "../../domain/entities/delivery-round.js";
import { LoadedStopMoveError } from "../../domain/errors/delivery-loading-errors.js";
import { InvalidProposalError } from "../../domain/errors/delivery-routing-errors.js";
import { ProposalAppliedEvent } from "../../domain/events/delivery-routing.events.js";
import { DeliveryProposalRepository } from "../../domain/ports/delivery-proposal.repository.js";
import { DeliveryRoundRepository } from "../../domain/ports/delivery-round.repository.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { LoadedStopsReader } from "../../domain/ports/loaded-stops.reader.js";
import { VehicleRepository } from "../../domain/ports/vehicle.repository.js";
import { applyProposal } from "../../domain/services/apply-proposal.js";
import {
  changedRounds,
  ensureNewOrdersAssignable,
  loadTouchedRounds,
  openingsOf,
} from "../delivery-apply-support.js";
import { ensureRoundVehicleActive, referencesOf } from "../delivery-round-support.js";
import { ApplyDeliveryProposalCommand } from "./apply-delivery-proposal.command.js";

/**
 * **Appliquer une proposition** (L7-C6, L7-C11, L7-C14) — ouvrir les tournées
 * manquantes, affecter, déplacer, réordonner, en UNE transaction, sous les
 * versions lues avec la proposition. Un seul refus annule tout ; un fait au
 * journal, `delivery_round.proposal_applied`.
 *
 * Tout est d'abord vérifié sans verrou, pour que le refus NOMME ce qui a
 * changé ; l'adaptateur revérifie sous verrou ce qu'une course aurait pu
 * défaire entre-temps.
 *
 * @throws {ProposalOutdatedError} @throws {InvalidProposalError}
 * @throws {DeliveryRoundNotFoundError} @throws {DeliveryRoundStaleError}
 * @throws {DeliveryRoundDepartedError} @throws {LoadedStopMoveError}
 * @throws {OrderNotAssignableError} @throws {OrderAlreadyInRoundError}
 * @throws {VehicleNotFoundError} @throws {VehicleInactiveOnDayError}
 */
@CommandHandler(ApplyDeliveryProposalCommand)
export class ApplyDeliveryProposalHandler implements ICommandHandler<
  ApplyDeliveryProposalCommand,
  void
> {
  constructor(
    private readonly rounds: DeliveryRoundRepository,
    private readonly reader: DeliveryRoundsReader,
    private readonly proposals: DeliveryProposalRepository,
    private readonly vehicles: VehicleRepository,
    private readonly loadedStops: LoadedStopsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly events: DomainEventPublisher,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(command: ApplyDeliveryProposalCommand): Promise<void> {
    const { payload } = command;
    const at = this.clock.now();
    await this.uow.run(async () => {
      const touched = await loadTouchedRounds(this.rounds, this.reader, payload);
      const held = new Set([...touched.values()].flatMap((round) => round.orderIds));
      const fresh = payload.rounds.flatMap((item) => item.orderIds.filter((id) => !held.has(id)));
      await ensureNewOrdersAssignable(this.orders, this.rounds, payload.day, fresh);
      const openings = await openingsOf(this.vehicles, this.rounds, payload);
      const drawn = new Map<string, number>();
      const applied = applyProposal({
        proposal: payload.rounds,
        rounds: touched,
        open: (vehicleId) => {
          const opening = openings.get(vehicleId);
          if (opening === undefined) {
            throw new InvalidProposalError(`le véhicule ${vehicleId} n'a pas été lu`);
          }
          const passage = opening.nextPassage + (drawn.get(vehicleId) ?? 0);
          drawn.set(vehicleId, (drawn.get(vehicleId) ?? 0) + 1);
          return DeliveryRound.open({
            ...{ id: this.ids.next(), serviceDay: payload.day, vehicle: opening.vehicle },
            ...{ passage, at },
          });
        },
        newStopId: () => this.ids.next(),
        at,
      });
      await this.ensureMovable(applied.movedStops);
      // Une tournée qui REÇOIT roule ce jour-là (C14) ; une qui ne fait que
      // perdre des arrêts peut être sur un véhicule retiré depuis.
      const targets = new Set(payload.rounds.flatMap((item) => item.roundId ?? []));
      for (const { round } of applied.rounds.filter(({ round }) => targets.has(round.id))) {
        await ensureRoundVehicleActive(this.vehicles, round);
      }
      await this.proposals.applyProposal({
        rounds: applied.rounds.map(({ round }) => round),
        movedStops: applied.movedStops,
      });
      await this.journal(payload.day, changedRounds(applied.rounds));
    });
  }

  /** Un arrêt déplacé n'a aucun bac chargé (L4-C5) — nommé ici, revérifié sous verrou. */
  private async ensureMovable(
    moved: readonly { readonly stopId: string; readonly fromVehicleName: string }[],
  ): Promise<void> {
    const loaded = await this.loadedStops.loadedAmong(moved.map((stop) => stop.stopId));
    const first = moved.find((stop) => loaded.has(stop.stopId));
    if (first !== undefined) {
      throw new LoadedStopMoveError(first.fromVehicleName);
    }
  }

  private async journal(day: string, changed: ReturnType<typeof changedRounds>): Promise<void> {
    if (changed.length === 0) {
      return;
    }
    const orderIds = changed.flatMap(({ round, before }) => [...before, ...round.orderIds]);
    const references = await referencesOf(this.orders, [...new Set(orderIds)]);
    await this.events.publishTraced(new ProposalAppliedEvent(day, changed, references));
  }
}

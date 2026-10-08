import type { RoundRow } from "../../domain/ports/delivery-rounds.reader.js";
import { RoutingSettingsReader } from "../../domain/ports/routing-settings.reader.js";
import { type RoundPlace, roundPlaceOf } from "../../domain/services/round-place.js";
import { routingSettingsOf } from "../delivery-routing-support.js";
import { ProposalCapacity } from "../proposal-capacity.js";
import type { DeliveryRoundsDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { DeliveryOrdersReader, DeliveryOrderStatesReader } from "../../channels/commerce/index.js";
import { BroughtBackOrdersReader } from "../../domain/ports/brought-back-orders.reader.js";
import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { FleetReader } from "../../domain/ports/fleet.reader.js";
import { ordersToReplace } from "../brought-back-support.js";
import { deliveryIncidentView } from "../delivery-incident-view.js";
import { driverNamesOf, driversNow } from "../delivery-driver-support.js";
import { deliveryRoundsDayView } from "../delivery-rounds-view.js";
import { GetDeliveryRoundsDayQuery } from "./get-delivery-rounds-day.query.js";

/**
 * La composition d'un jour : les tournées, leurs arrêts signalés, leur
 * livreur (et s'il peut encore livrer : conduire ET les gestes à la porte,
 * audit 2026-10-07, B8), ce qui reste à répartir, et les
 * problèmes signalés par les livreurs (`a-la-porte.md`, § 3), et les
 * commandes rapportées à replacer, quel que soit le jour (lot RL1), et les
 * arrêts posés hors des zones de leur véhicule (2026-10-06). Une
 * lecture : elle n'écrit rien.
 */
@QueryHandler(GetDeliveryRoundsDayQuery)
export class GetDeliveryRoundsDayHandler implements IQueryHandler<
  GetDeliveryRoundsDayQuery,
  DeliveryRoundsDayView
> {
  constructor(
    private readonly rounds: DeliveryRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly holders: StaffPermissionHolders,
    private readonly directory: StaffAuthorDirectory,
    private readonly incidents: DeliveryIncidentsReader,
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly states: DeliveryOrderStatesReader,
    private readonly fleet: FleetReader,
    private readonly settings: RoutingSettingsReader,
    private readonly place: ProposalCapacity,
  ) {}

  async execute(query: GetDeliveryRoundsDayQuery): Promise<DeliveryRoundsDayView> {
    const [rounds, expected, incidents, awaiting] = await Promise.all([
      this.rounds.roundsOn(query.day),
      this.orders.expectedOn(query.day),
      this.incidents.ofDay(query.day),
      ordersToReplace(this.broughtBack, this.orders, this.states),
    ]);
    const composedIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const driverIds = rounds.flatMap((round) =>
      round.driverStaffId === null ? [] : [round.driverStaffId],
    );
    const [composed, assigned, drivers, driverNames, broughtBack, fleet, places] =
      await Promise.all([
        this.orders.byIds(composedIds),
        this.rounds.composedAmong(expected.map((order) => order.orderId)),
        driversNow(this.holders),
        driverNamesOf(this.directory, driverIds),
        this.broughtBack.lastAmong([...composedIds, ...awaiting.map((order) => order.orderId)]),
        this.fleet.list(),
        this.placesOf(rounds),
      ]);
    const view = deliveryRoundsDayView({
      day: query.day,
      places,
      rounds,
      expected,
      composed: new Map(composed.map((order) => [order.orderId, order])),
      assigned,
      drivers,
      driverNames,
      awaiting,
      broughtBack,
      vehicleZones: new Map(
        fleet
          .filter((vehicle) => vehicle.allowedZoneIds.length > 0)
          .map((vehicle) => [vehicle.id, new Set(vehicle.allowedZoneIds)]),
      ),
    });
    return { ...view, incidents: incidents.map(deliveryIncidentView) };
  }

  /**
   * La place des tournées au dépôt (2026-10-07) : la garde de « Proposer »,
   * pour AVERTIR après une affectation à la main. Une tournée partie n'est
   * plus composée : elle n'est pas jugée.
   */
  private async placesOf(rounds: readonly RoundRow[]): Promise<ReadonlyMap<string, RoundPlace>> {
    const atDepot = rounds.filter((round) => round.departedAt === null && round.stops.length > 0);
    if (atDepot.length === 0) {
      return new Map();
    }
    const { settings } = await routingSettingsOf(this.settings);
    const orderIds = atDepot.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const { capacity, unknown } = await this.place.of(orderIds, settings);
    return new Map(
      atDepot.map((round) => [
        round.id,
        roundPlaceOf({
          capacity,
          unknown,
          vehicleId: round.vehicleId,
          orderIds: round.stops.map((stop) => stop.orderId),
        }),
      ]),
    );
  }
}

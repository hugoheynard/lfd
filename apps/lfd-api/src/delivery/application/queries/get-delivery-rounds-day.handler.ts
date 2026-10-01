import type { DeliveryRoundsDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { StaffPermissionHolders } from "../../../staff/directory/domain/staff-permission-holders.js";
import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { DeliveryRoundsReader } from "../../domain/ports/delivery-rounds.reader.js";
import { deliveryIncidentView } from "../delivery-incident-view.js";
import { driverNamesOf, driversNow } from "../delivery-driver-support.js";
import { deliveryRoundsDayView } from "../delivery-rounds-view.js";
import { GetDeliveryRoundsDayQuery } from "./get-delivery-rounds-day.query.js";

/**
 * La composition d'un jour : les tournées, leurs arrêts signalés, leur
 * livreur (et s'il peut encore conduire), ce qui reste à répartir, et les
 * problèmes signalés par les livreurs (`plan-a-la-porte.md`, § 3). Une
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
  ) {}

  async execute(query: GetDeliveryRoundsDayQuery): Promise<DeliveryRoundsDayView> {
    const [rounds, expected, incidents] = await Promise.all([
      this.rounds.roundsOn(query.day),
      this.orders.expectedOn(query.day),
      this.incidents.ofDay(query.day),
    ]);
    const composedIds = rounds.flatMap((round) => round.stops.map((stop) => stop.orderId));
    const driverIds = rounds.flatMap((round) =>
      round.driverStaffId === null ? [] : [round.driverStaffId],
    );
    const [composed, assigned, drivers, driverNames] = await Promise.all([
      this.orders.byIds(composedIds),
      this.rounds.composedAmong(expected.map((order) => order.orderId)),
      driversNow(this.holders),
      driverNamesOf(this.directory, driverIds),
    ]);
    const view = deliveryRoundsDayView({
      day: query.day,
      rounds,
      expected,
      composed: new Map(composed.map((order) => [order.orderId, order])),
      assigned,
      drivers,
      driverNames,
    });
    return { ...view, incidents: incidents.map(deliveryIncidentView) };
  }
}

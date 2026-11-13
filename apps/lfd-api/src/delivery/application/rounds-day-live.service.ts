import { Injectable } from "@nestjs/common";

import { StaffAuthorDirectory } from "../../staff/directory/domain/staff-author-directory.js";
import { StaffPermissionHolders } from "../../staff/directory/domain/staff-permission-holders.js";
import {
  type DeliveryOrderFacts,
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
} from "../channels/commerce/index.js";
import { BroughtBackOrdersReader } from "../domain/ports/brought-back-orders.reader.js";
import { DeliveryRoundsReader } from "../domain/ports/delivery-rounds.reader.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";
import { RoutingSettingsReader } from "../domain/ports/routing-settings.reader.js";
import { type RoundPlace, roundPlaceOf } from "../domain/services/round-place.js";
import { ordersToReplace } from "./brought-back-support.js";
import { driverNamesOf, driversNow } from "./delivery-driver-support.js";
import { routingSettingsOf } from "./delivery-routing-support.js";
import type { RoundsDayLive } from "./delivery-rounds-view.js";
import { ProposalCapacity } from "./proposal-capacity.js";
import type { RoundsDayComposition, RoundsDayRound } from "./rounds-day-composition.js";

/**
 * **Ce que l'écran Tournées lit à CHAQUE appel**, autour d'une composition
 * rangée ou relue — jamais rangé :
 *
 * - les livreurs, leurs droits et leur nom (Hugo, 2026-11-13) : un droit
 *   retiré se voit au prochain appel, sans attendre un numéro ;
 * - la flotte (Hugo, 2026-11-13) : zones autorisées, véhicule retiré ;
 * - la place au dépôt : tirée de la charge des véhicules (la flotte) et des
 *   réglages ; la lire vieille avertirait sur une flotte qui n'est plus ;
 * - les commandes rapportées à replacer, de n'importe quel jour : aucun
 *   numéro de CETTE journée ne suit un retour d'un autre jour ;
 * - l'état des commandes composées et les attendues déjà placées : une
 *   commande d'un autre jour annulée, ou placée dans une tournée d'un autre
 *   jour, fait monter le numéro de CET autre jour, pas celui de l'écran.
 */
@Injectable()
export class RoundsDayLiveReading {
  constructor(
    private readonly rounds: DeliveryRoundsReader,
    private readonly holders: StaffPermissionHolders,
    private readonly directory: StaffAuthorDirectory,
    private readonly fleet: FleetReader,
    private readonly settings: RoutingSettingsReader,
    private readonly place: ProposalCapacity,
    private readonly broughtBack: BroughtBackOrdersReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly states: DeliveryOrderStatesReader,
  ) {}

  async around(composition: RoundsDayComposition): Promise<RoundsDayLive> {
    const composedIds = composition.rounds.flatMap((round) =>
      round.stops.map((stop) => stop.orderId),
    );
    const driverIds = composition.rounds.flatMap((round) =>
      round.driverStaffId === null ? [] : [round.driverStaffId],
    );
    const [[composed, assigned], awaiting, drivers, driverNames, fleet, places] = await Promise.all(
      [
        this.ordersOf(composition, composedIds),
        ordersToReplace(this.broughtBack, this.orders, this.states),
        driversNow(this.holders),
        driverNamesOf(this.directory, driverIds),
        this.fleet.list(),
        this.placesOf(composition.rounds),
      ],
    );
    const broughtBack = await this.broughtBack.lastAmong([
      ...composedIds,
      ...awaiting.map((order) => order.orderId),
    ]);
    return {
      composed,
      assigned,
      places,
      drivers,
      driverNames,
      awaiting,
      broughtBack,
      vehicleZones: new Map(
        fleet
          .filter((vehicle) => vehicle.allowedZoneIds.length > 0)
          .map((vehicle) => [vehicle.id, new Set(vehicle.allowedZoneIds)]),
      ),
      vehicleRetiredAt: new Map(
        fleet.map((vehicle) => [
          vehicle.id,
          vehicle.retiredAt === null ? null : new Date(vehicle.retiredAt),
        ]),
      ),
    };
  }

  /** Ce que le commerce dit des composées, et les attendues déjà dans une tournée vivante. */
  private async ordersOf(
    composition: RoundsDayComposition,
    composedIds: readonly string[],
  ): Promise<readonly [ReadonlyMap<string, DeliveryOrderFacts>, ReadonlySet<string>]> {
    const [composed, assigned] = await Promise.all([
      this.orders.byIds(composedIds),
      this.rounds.composedAmong(composition.ofDay.map((order) => order.orderId)),
    ]);
    return [new Map(composed.map((order) => [order.orderId, order])), assigned];
  }

  /**
   * La place des tournées au dépôt (2026-10-07) : la garde de « Proposer »,
   * pour AVERTIR après une affectation à la main. Une tournée partie n'est
   * plus composée : elle n'est pas jugée.
   */
  private async placesOf(
    rounds: readonly RoundsDayRound[],
  ): Promise<ReadonlyMap<string, RoundPlace>> {
    const atDepot = rounds.filter(
      (round) => round.departedAt === null && round.stops.length + round.transferStops.length > 0,
    );
    if (atDepot.length === 0) {
      return new Map();
    }
    const { settings } = await routingSettingsOf(this.settings);
    const orderIdsOf = (round: RoundsDayRound) => round.stops.map((stop) => stop.orderId);
    const { capacity, unknown } = await this.place.of(atDepot.flatMap(orderIdsOf), settings);
    return new Map(
      atDepot.map((round) => [
        round.id,
        roundPlaceOf({
          capacity,
          unknown,
          vehicleId: round.vehicleId,
          orderIds: orderIdsOf(round),
        }),
      ]),
    );
  }
}

import type { GpsPoint, MyDeliveryRoundView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  DeliveryOrdersReader,
  DeliveryProceduresReader,
  type DeliveryProcedureStep,
  DepartureCandidatesReader,
} from "../../channels/commerce/index.js";
import type { DepartureSheet } from "../../domain/entities/departure-sheet.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import {
  DriverRoundsReader,
  type DriverRoundRow,
} from "../../domain/ports/driver-rounds.reader.js";
import { departureViewOf } from "../departure-view.js";
import { myDeliveryRoundView } from "../my-delivery-round-view.js";
import { GetMyDeliveryRoundQuery } from "./get-my-delivery-round.query.js";

/**
 * **Ma tournée, arrêt par arrêt** (plan « Ma tournée », MT-D4, MT-D5 v2).
 *
 * La tournée est lue SOUS LE MUR du livreur ; absente ou à un autre, c'est un
 * 404 qui ne confirme rien. Puis, en parallèle et pour la tournée entière :
 * les feuilles vivantes et les points du carnet du commerce (seulement pour
 * ce que le départ n'a pas figé), la procédure vivante, le point de départ.
 * Une lecture : elle n'écrit rien.
 *
 * @throws {DriverRoundNotFoundError}
 */
@QueryHandler(GetMyDeliveryRoundQuery)
export class GetMyDeliveryRoundHandler implements IQueryHandler<
  GetMyDeliveryRoundQuery,
  MyDeliveryRoundView
> {
  constructor(
    private readonly rounds: DriverRoundsReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly procedures: DeliveryProceduresReader,
    private readonly departure: DepartureReader,
    private readonly candidates: DepartureCandidatesReader,
  ) {}

  async execute(query: GetMyDeliveryRoundQuery): Promise<MyDeliveryRoundView> {
    const round = await this.rounds.roundOf(query.staffUserId, query.roundId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const orderIds = round.stops.map((stop) => stop.orderId);
    const [sheets, points, procedures, chosenId, candidates] = await Promise.all([
      this.liveSheetsOf(round),
      this.carnetPointsOf(round),
      this.procedures.proceduresOf(orderIds),
      this.departure.chosenPickupAddressId(),
      this.candidates.list(),
    ]);
    return myDeliveryRoundView({
      round,
      sheets,
      carnetPoints: points,
      procedures: new Map<string, readonly DeliveryProcedureStep[]>(
        procedures.map((procedure) => [procedure.orderId, procedure.steps]),
      ),
      home: departureViewOf(chosenId, candidates).point,
    });
  }

  /** Les feuilles du commerce, pour les seuls arrêts que le départ n'a pas figés. */
  private async liveSheetsOf(round: DriverRoundRow): Promise<ReadonlyMap<string, DepartureSheet>> {
    const unfrozen = round.stops.filter((stop) => stop.departed === null);
    if (unfrozen.length === 0) {
      return new Map();
    }
    const sheets = await this.orders.departureSheetsOf(unfrozen.map((stop) => stop.orderId));
    return new Map(sheets.map((sheet) => [sheet.orderId, sheet]));
  }

  /** Le point du carnet, pour les seuls arrêts dont le départ n'a pas figé le point. */
  private async carnetPointsOf(
    round: DriverRoundRow,
  ): Promise<ReadonlyMap<string, GpsPoint | null>> {
    const unfrozen = round.stops.filter((stop) => (stop.departed?.departureRank ?? null) === null);
    if (unfrozen.length === 0) {
      return new Map();
    }
    const points = await this.orders.stopPointsOf(unfrozen.map((stop) => stop.orderId));
    return new Map(points.map((point) => [point.orderId, point.gps]));
  }
}

import type { DeliveryStopOrderState, GpsPoint, MyDeliveryRoundView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import {
  DeliveryOrdersReader,
  DeliveryOrderStatesReader,
  DeliveryProceduresReader,
  type DeliveryProcedureStep,
  DepartureCandidatesReader,
} from "../../channels/commerce/index.js";
import type { DepartureSheet } from "../../domain/entities/departure-sheet.js";
import { DriverRoundNotFoundError } from "../../domain/errors/delivery-driver-errors.js";
import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { DepartureReader } from "../../domain/ports/departure.reader.js";
import { StopDecisionsReader } from "../../domain/ports/stop-decisions.reader.js";
import {
  DriverRoundsReader,
  type DriverRoundRow,
} from "../../domain/ports/driver-rounds.reader.js";
import { departureViewOf } from "../departure-view.js";
import { myDeliveryRoundView } from "../my-delivery-round-view.js";
import { StopSheets } from "../stop-sheets.js";
import { GetMyDeliveryRoundQuery } from "./get-my-delivery-round.query.js";

/**
 * **Ma tournée, arrêt par arrêt** (plan « Ma tournée », MT-D4, MT-D5 v2).
 *
 * La tournée est lue SOUS LE MUR du livreur ; absente ou à un autre, c'est un
 * 404 qui ne confirme rien. Puis, en parallèle et pour la tournée entière :
 * les feuilles vivantes et les points du carnet du commerce (seulement pour
 * ce que le départ n'a pas figé), la procédure vivante, le point de départ,
 * l'état de chaque commande et les signalements de la tournée (plan « À la
 * porte »), la fiche de chaque arrêt avec l'avancement du colisage (PL4), et
 * les décisions des commerciaux sur ses arrêts (B3).
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
    private readonly states: DeliveryOrderStatesReader,
    private readonly incidents: DeliveryIncidentsReader,
    private readonly stopSheets: StopSheets,
    private readonly decisions: StopDecisionsReader,
  ) {}

  async execute(query: GetMyDeliveryRoundQuery): Promise<MyDeliveryRoundView> {
    const round = await this.rounds.roundOf(query.staffUserId, query.roundId);
    if (round === null) {
      throw new DriverRoundNotFoundError();
    }
    const orderIds = round.stops.map((stop) => stop.orderId);
    const [sheets, points, procedures, chosenId, candidates, states, incidents, stopSheets] =
      await Promise.all([
        this.liveSheetsOf(round),
        this.carnetPointsOf(round),
        this.procedures.proceduresOf(orderIds),
        this.departure.chosenPickupAddressId(),
        this.candidates.list(),
        this.states.statesOf(orderIds),
        this.incidents.ofRounds([round.id]),
        this.stopSheets.of(orderIds),
      ]);
    // Lues pour CETTE tournée, déjà lue sous le mur du livreur.
    const decisions = await this.decisions.ofRound(round.id);
    return myDeliveryRoundView({
      round,
      sheets,
      carnetPoints: points,
      procedures: new Map<string, readonly DeliveryProcedureStep[]>(
        procedures.map((procedure) => [procedure.orderId, procedure.steps]),
      ),
      home: departureViewOf(chosenId, candidates).point,
      orderStates: new Map<string, DeliveryStopOrderState>(
        states.map((state) => [state.orderId, state.state]),
      ),
      incidents,
      stopSheets,
      readyOrders: new Set(states.filter((state) => state.ready).map((state) => state.orderId)),
      decisions: new Map(decisions.map((row) => [row.stopId, row])),
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

import { instantToLocal, type UndeliveredStopsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { UndeliveredStopsReader } from "../../domain/ports/undelivered-stops.reader.js";
import { deliveryIncidentView } from "../delivery-incident-view.js";
import { GetUndeliveredStopsQuery } from "./get-undelivered-stops.query.js";

/**
 * **« Non remis »** (`documentation/livraisons/a-la-porte.md`, AP-D7 ;
 * `parcours-du-livreur.md`, PL2) — les arrêts non clos des tournées
 * RENTRÉES, et ceux des tournées parties d'un jour antérieur à aujourd'hui
 * jamais rentrées (heure de Paris, `instantToLocal` : à 00 h 30 l'été, l'UTC
 * dit encore la veille), avec leurs signalements.
 *
 * Une VUE, pas un déblocage : ces commandes restent dans une tournée vivante,
 * à traiter hors application en attendant les reports (6 c). Elle n'écrit rien.
 */
@QueryHandler(GetUndeliveredStopsQuery)
export class GetUndeliveredStopsHandler implements IQueryHandler<
  GetUndeliveredStopsQuery,
  UndeliveredStopsView
> {
  constructor(
    private readonly stops: UndeliveredStopsReader,
    private readonly incidents: DeliveryIncidentsReader,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<UndeliveredStopsView> {
    const today = instantToLocal(this.clock.now()).day;
    const stops = await this.stops.undelivered(today);
    const incidents = await this.incidents.ofRounds([...new Set(stops.map((s) => s.roundId))]);
    return {
      before: today,
      stops: stops.map((stop) => ({
        roundId: stop.roundId,
        vehicleName: stop.vehicleName,
        passage: stop.passage,
        serviceDay: stop.serviceDay,
        stopId: stop.stopId,
        orderId: stop.orderId,
        reference: stop.reference,
        customerLabel: stop.customerLabel,
        departedAt: stop.departedAt.toISOString(),
        returnedAt: stop.returnedAt?.toISOString() ?? null,
        arrivedAt: stop.arrivedAt?.toISOString() ?? null,
        incidents: incidents
          .filter((row) => row.roundId === stop.roundId && concerns(row.stopId, stop.stopId))
          .map(deliveryIncidentView),
      })),
    };
  }
}

/** Un signalement porte sur l'arrêt — ou sur toute la tournée (technique, routier sans arrêt). */
function concerns(incidentStopId: string | null, stopId: string): boolean {
  return incidentStopId === null || incidentStopId === stopId;
}

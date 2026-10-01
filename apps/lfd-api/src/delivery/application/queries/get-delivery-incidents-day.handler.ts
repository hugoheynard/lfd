import type { DeliveryIncidentsDayView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryIncidentsReader } from "../../domain/ports/delivery-incidents.reader.js";
import { deliveryIncidentView } from "../delivery-incident-view.js";
import { GetDeliveryIncidentsDayQuery } from "./get-delivery-incidents-day.query.js";

/**
 * Les problèmes signalés par les livreurs un jour donné, toutes tournées
 * confondues, du plus ancien au plus récent. Une lecture : elle n'écrit rien.
 */
@QueryHandler(GetDeliveryIncidentsDayQuery)
export class GetDeliveryIncidentsDayHandler implements IQueryHandler<
  GetDeliveryIncidentsDayQuery,
  DeliveryIncidentsDayView
> {
  constructor(private readonly incidents: DeliveryIncidentsReader) {}

  async execute(query: GetDeliveryIncidentsDayQuery): Promise<DeliveryIncidentsDayView> {
    const rows = await this.incidents.ofDay(query.day);
    return { day: query.day, incidents: rows.map(deliveryIncidentView) };
  }
}

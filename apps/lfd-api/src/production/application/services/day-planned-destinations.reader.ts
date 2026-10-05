import { Injectable } from "@nestjs/common";

import { PlannedDestinationsReader } from "../../channels/packing/planned-destinations.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";

/**
 * L'implémentation du port publié `PlannedDestinationsReader` : la journée,
 * lue par son agrégat — la destination est celle que la clôture a figée.
 *
 * Lecture seule : `load` ne prend aucun verrou et n'écrit rien.
 */
@Injectable()
export class DayPlannedDestinationsReader extends PlannedDestinationsReader {
  constructor(private readonly days: ProductionDayRepository) {
    super();
  }

  async destinationsOf(serviceDay: string): Promise<ReadonlyMap<string, string>> {
    const day = await this.days.load(ServiceDay.of(serviceDay));
    return new Map(day.orders.map((order) => [order.orderId, order.destination] as const));
  }
}

import type { DayVersionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { InvalidServiceDayError } from "../../domain/errors/delivery-round-errors.js";
import { DeliveryDayVersionReader } from "../../domain/ports/delivery-day-version.reader.js";
import { isCalendarDay } from "../../domain/value-objects/service-day.js";
import { GetDeliveryDayVersionQuery } from "./get-delivery-day-version.query.js";

/**
 * **La journée de la livraison a-t-elle bougé ?** — la question qu'un écran
 * pose au lieu de tout relire (`plan-schema-delivery.md`, SD-D3 ; même contrat
 * que `GET admin/production/version`).
 *
 * Une opération. Le numéro avance par les déclencheurs de la base : ce handler
 * ne fait que le lire.
 *
 * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
 */
@QueryHandler(GetDeliveryDayVersionQuery)
export class GetDeliveryDayVersionHandler implements IQueryHandler<
  GetDeliveryDayVersionQuery,
  DayVersionView
> {
  constructor(private readonly versions: DeliveryDayVersionReader) {}

  async execute(query: GetDeliveryDayVersionQuery): Promise<DayVersionView> {
    if (!isCalendarDay(query.serviceDay)) {
      throw new InvalidServiceDayError(query.serviceDay);
    }
    return { date: query.serviceDay, version: await this.versions.versionOf(query.serviceDay) };
  }
}

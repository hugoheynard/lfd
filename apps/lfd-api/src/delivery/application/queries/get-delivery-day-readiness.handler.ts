import type { DeliveryDayReadinessView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { InvalidServiceDayError } from "../../domain/errors/delivery-round-errors.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../../domain/ports/composition-prerequisites.readers.js";
import { DeliveryDayReadinessReader } from "../../domain/ports/delivery-day-readiness.reader.js";
import { compositionGapOf } from "../../domain/services/composition-prerequisites.js";
import { dueOf } from "../../domain/services/rounds-gap.js";
import { isCalendarDay } from "../../domain/value-objects/service-day.js";
import { localNowOf } from "../rounds-gap-support.js";
import { GetDeliveryDayReadinessQuery } from "./get-delivery-day-readiness.query.js";

/**
 * **Le plan de ce jour est-il arrêté ?** (`documentation/livraisons/composition-automatique.md`,
 * §4, S5) — ce que l'abonné à la clôture a rangé, et le socle de la
 * composition lu maintenant (CA-D3) : un véhicule mesuré depuis la cloche
 * ne laisse pas l'alerte à l'écran.
 *
 * `due` dit si le jour est aujourd'hui ou demain à l'heure du `Clock` :
 * avec des livraisons hors tournée, l'écran passe en alerte (§5, l'alerte
 * avant le jour J). Lecture pure : la cloche du même cas est un passage
 * machine à part (`RingRoundsGapBellHandler`).
 *
 * Une ligne sans clôture (un retirage reçu seul, CA6b) n'est pas un plan
 * arrêté : `arrested` reste nul.
 *
 * @throws {InvalidServiceDayError} le jour n'existe pas au calendrier.
 */
@QueryHandler(GetDeliveryDayReadinessQuery)
export class GetDeliveryDayReadinessHandler implements IQueryHandler<
  GetDeliveryDayReadinessQuery,
  DeliveryDayReadinessView
> {
  constructor(
    private readonly readiness: DeliveryDayReadinessReader,
    private readonly vehicles: MeasuredVehiclesReader,
    private readonly binTypes: ActiveBinTypesReader,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetDeliveryDayReadinessQuery): Promise<DeliveryDayReadinessView> {
    const day = query.serviceDay;
    if (!isCalendarDay(day)) {
      throw new InvalidServiceDayError(day);
    }
    const row = await this.readiness.readinessOf(day);
    if (row?.closedAt == null) {
      return { day, arrested: null };
    }
    const [measuredVehicleIds, activeBinTypeIds] = await Promise.all([
      this.vehicles.measuredIds(),
      this.binTypes.activeIds(),
    ]);
    return {
      day,
      arrested: {
        closedAt: row.closedAt.toISOString(),
        deliveryCount: row.deliveryCount,
        unplacedCount: row.unplacedCount,
        compositionGap: compositionGapOf({ measuredVehicleIds, activeBinTypeIds }),
        due: dueOf(day, localNowOf(this.clock.now())),
      },
    };
  }
}

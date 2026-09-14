import type { ProductionWorksheetView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { todayOf, tomorrowOf } from "../../domain/services/relative-day.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { ProductionWorksheetReading } from "../services/production-worksheet-reading.service.js";
import { GetCurrentProductionWorksheetQuery } from "./get-current-production-worksheet.query.js";

/**
 * **La fiche en cours** : demain si son plan est arrêté, aujourd'hui sinon.
 *
 * La règle du 2026-09-13, rendue au serveur le 2026-09-14. Un plan arrêté pour
 * demain veut dire que le fournil a lancé la fabrication du lendemain — c'est
 * donc la fiche qu'il a sous les mains, même s'il est encore la veille au
 * calendrier. Tant que rien n'est arrêté pour demain, on sert aujourd'hui.
 *
 * Le jour se lit au `Clock`, **à l'heure de Paris** : l'horloge d'un poste de
 * fournil n'est pas une autorité, et deux postes réglés différemment ouvriraient
 * deux fiches le même matin.
 *
 * ⚠️ La journée de demain est chargée ici, puis rechargée par la lecture de la
 * fiche quand c'est elle qu'on sert. Une requête de plus, assumée : le service
 * partagé reste une lecture d'un jour, sans variante « déjà chargé » que la
 * route datée n'utiliserait pas.
 */
@QueryHandler(GetCurrentProductionWorksheetQuery)
export class GetCurrentProductionWorksheetHandler implements IQueryHandler<
  GetCurrentProductionWorksheetQuery,
  ProductionWorksheetView
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly reading: ProductionWorksheetReading,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<ProductionWorksheetView> {
    const now = this.clock.now();
    const tomorrow = ServiceDay.of(tomorrowOf(now));
    const next = await this.days.load(tomorrow);
    const worked = next.isClosed ? tomorrow : ServiceDay.of(todayOf(now));
    return this.reading.read(worked);
  }
}

import type { ProductionPackingView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../platform/time/clock.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { packingBoardOf } from "../../domain/services/production-packing.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionPackingQuery } from "./get-production-packing.query.js";

/**
 * **Le poste du fournil**, servi en une lecture.
 *
 * Une seule source, contrairement à la fiche d'atelier : il n'y a rien à
 * arbitrer ici. Le colisage ne se fait que sur un plan ARRÊTÉ — un bac se
 * remplit à partir d'un bon figé, pas d'une demande qui bouge encore — donc la
 * journée seule dit tout, et le calcul de la balance vit dans `packingBoardOf`.
 *
 * ⚠️ Une journée ouverte rend `closedAt: null` avec deux listes vides, **et ne
 * lève pas**. Une lecture n'a pas à refuser un jour qui existe et qu'on a
 * simplement ouvert trop tôt ; c'est l'écran qui dit « plan non arrêté ».
 *
 * ⚠️ Le `Clock` n'entre ici que pour `relativeDay` — « aujourd'hui », « demain »
 * — selon l'horloge du SERVEUR. Celle d'un poste de fournil n'est pas une
 * autorité, et l'écran ne compare plus de dates.
 *
 * Il n'écrit rien, pas même un compteur — §4.
 */
@QueryHandler(GetProductionPackingQuery)
export class GetProductionPackingHandler implements IQueryHandler<
  GetProductionPackingQuery,
  ProductionPackingView
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: GetProductionPackingQuery): Promise<ProductionPackingView> {
    const day = ServiceDay.of(query.serviceDay);
    const current = await this.days.load(day);
    return packingBoardOf({
      date: day.value,
      closedAt: current.closedAt,
      orders: current.orders,
      counts: current.counts,
      now: this.clock.now(),
    });
  }
}

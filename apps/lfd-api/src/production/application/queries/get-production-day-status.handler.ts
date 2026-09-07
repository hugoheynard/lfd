import type { ProductionDayStatus } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PendingCommerceOrdersReader } from "../../channels/commerce/pending-orders.reader.js";
import { ProductionDayRepository } from "../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
import { GetProductionDayStatusQuery } from "./get-production-day-status.query.js";

/**
 * **L'état d'une journée — et la divergence, s'il y en a une.**
 *
 * Une lecture, et elle n'écrit rien : pas même un compteur. Ce qu'elle apporte
 * n'existait nulle part — la production savait qu'elle avait arrêté une journée,
 * le commerce savait ce qu'il avait basculé, et **personne ne comparait les
 * deux**.
 *
 * ⚠️ C'est le contrepoids du couplage minimal. Le bus vit en processus,
 * l'événement n'est ni persisté ni rejoué ; un abonné qui échoue laisse des
 * commandes `placed` sur une journée close. Cette lecture le montre. Le
 * rattrapage, lui, reste un geste — reclore la journée republie le fait.
 *
 * `pendingInCommerce` n'est demandé que sur une journée **close** : sur une
 * journée ouverte, des commandes `placed` sont l'état normal, et compter
 * quoi que ce soit ferait passer la normalité pour une anomalie.
 */
@QueryHandler(GetProductionDayStatusQuery)
export class GetProductionDayStatusHandler implements IQueryHandler<
  GetProductionDayStatusQuery,
  ProductionDayStatus
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly pending: PendingCommerceOrdersReader,
  ) {}

  async execute(query: GetProductionDayStatusQuery): Promise<ProductionDayStatus> {
    const day = ServiceDay.of(query.serviceDay);
    const current = await this.days.load(day);
    const closedAt = current.closedAt;
    return {
      date: day.value,
      closedAt: closedAt === null ? null : closedAt.toISOString(),
      orders: current.orders.length,
      items: current.counts.length,
      pendingInCommerce: closedAt === null ? 0 : await this.pending.pendingFor(day, closedAt),
    };
  }
}

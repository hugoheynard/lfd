import type { ProductionDayStatus } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { PendingCommerceOrdersReader } from "../../channels/commerce/pending-orders.reader.js";
import { OrderHandoverRepository } from "../../domain/ports/order-handover.repository.js";
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
 * l'événement n'est ni persisté ni rejoué ; un abonné qui échoue laisse le
 * commerce en arrière. Cette lecture le montre, et le rattrapage reste un geste
 * — refaire celui qui a produit le fait, ce qui le republie.
 *
 * ## Trois faits, trois compteurs — depuis le 2026-09-08
 *
 * 🔴 Il n'y en avait qu'un, et c'était le trou du dispositif. Le fournil annonce
 * **trois** faits (clôture, colisage, remise) sur le même bus fragile, et seul
 * le premier avait son contrepoids. Un colisage ou une remise perdus ne se
 * voyaient nulle part : la commande restait en arrière, et personne ne pouvait
 * l'apprendre autrement qu'en comparant deux tables à la main.
 *
 * ## Pourquoi rien n'est compté sur une journée ouverte
 *
 * Sur une journée pas encore arrêtée, des commandes `placed` sont l'état normal,
 * et compter quoi que ce soit ferait passer la normalité pour une anomalie. La
 * clôture est aussi l'instant qui **borne** la fenêtre des remises regardées :
 * une fenêtre qui a un sens métier, plutôt qu'un nombre de jours au hasard.
 */
@QueryHandler(GetProductionDayStatusQuery)
export class GetProductionDayStatusHandler implements IQueryHandler<
  GetProductionDayStatusQuery,
  ProductionDayStatus
> {
  constructor(
    private readonly days: ProductionDayRepository,
    private readonly pending: PendingCommerceOrdersReader,
    private readonly handovers: OrderHandoverRepository,
  ) {}

  async execute(query: GetProductionDayStatusQuery): Promise<ProductionDayStatus> {
    const day = ServiceDay.of(query.serviceDay);
    const current = await this.days.load(day);
    const closedAt = current.closedAt;
    const base = {
      date: day.value,
      closedAt: closedAt === null ? null : closedAt.toISOString(),
      orders: current.orders.length,
      items: current.counts.length,
    };
    if (closedAt === null) {
      return { ...base, pendingInCommerce: 0, packedBehind: 0, handedOverBehind: 0 };
    }

    const packed = current.orders
      .filter((order) => order.packed !== null)
      .map((order) => order.reference);
    const attested = await this.handovers.referencesAttestedSince(closedAt);

    return {
      ...base,
      pendingInCommerce: await this.pending.pendingFor(day, closedAt),
      packedBehind: await this.pending.behindOnPacking(packed),
      handedOverBehind: await this.pending.behindOnHandover(attested),
    };
  }
}

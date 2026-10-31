import type { MercurialesAcceptingPromotionView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { UnendedMercurialesReader } from "../../domain/ports/unended-mercuriales.reader.js";
import { mercurialesAccepting } from "../../domain/services/mercuriales-accepting.js";
import { ListMercurialesAcceptingPromotionQuery } from "./list-mercuriales-accepting-promotion.query.js";

/**
 * Lecture seule : le réglage reste du côté de la mercuriale. Une promotion
 * inconnue ne lève rien — elle n'est simplement acceptée par personne.
 */
@QueryHandler(ListMercurialesAcceptingPromotionQuery)
export class ListMercurialesAcceptingPromotionHandler implements IQueryHandler<
  ListMercurialesAcceptingPromotionQuery,
  MercurialesAcceptingPromotionView
> {
  constructor(
    private readonly mercuriales: UnendedMercurialesReader,
    private readonly clock: Clock,
  ) {}

  async execute(
    query: ListMercurialesAcceptingPromotionQuery,
  ): Promise<MercurialesAcceptingPromotionView> {
    const at = this.clock.now();
    const accepting = mercurialesAccepting(
      await this.mercuriales.unendedAt(at),
      query.promotionId,
      at,
    );
    return {
      promotionId: query.promotionId,
      count: accepting.length,
      mercuriales: accepting.map((entry) => ({ ...entry })),
    };
  }
}

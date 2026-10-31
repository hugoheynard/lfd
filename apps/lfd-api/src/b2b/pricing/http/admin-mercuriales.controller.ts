import type { MercurialesAcceptingPromotionView } from "@lfd/contracts";
import { Controller, Get, Param } from "@nestjs/common";
import { QueryBus } from "@nestjs/cqrs";

import { AdminSurface } from "../../../platform/auth/admin-surface.decorator.js";
import { ListMercurialesAcceptingPromotionQuery } from "../application/queries/list-mercuriales-accepting-promotion.query.js";

/**
 * **Les mercuriales, tous clients confondus** — ce qu'une autre page demande
 * d'elles. Le réglage d'une mercuriale vit sur la fiche du client
 * (`AdminCompanyPricingController`) ; ici, on ne fait que lire.
 */
@Controller("admin/pricing/mercuriales")
@AdminSurface("b2b_pricing")
export class AdminMercurialesController {
  constructor(private readonly queries: QueryBus) {}

  /** « Clients à tarif négocié : N mercuriales l'acceptent » (`plan-la-mercuriale-decide.md`, § 7). */
  @Get("accepting-promotion/:promotionId")
  async accepting(
    @Param("promotionId") promotionId: string,
  ): Promise<MercurialesAcceptingPromotionView> {
    return this.queries.execute<
      ListMercurialesAcceptingPromotionQuery,
      MercurialesAcceptingPromotionView
    >(new ListMercurialesAcceptingPromotionQuery(promotionId));
  }
}

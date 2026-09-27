import type { MyShopQuoteView, ShopQuotePayload } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { LoyaltyEarningPreview } from "../../domain/ports/loyalty-earning-preview.js";
import { ShopCartQuoting } from "../services/shop-cart-quoting.service.js";

/**
 * Le décompte du panier d'un client **connecté** — celui de la vitrine, plus
 * les points que la commande rapporterait (plan des points, E1.2).
 */
export class QuoteMyShopCartQuery {
  constructor(
    readonly payload: ShopQuotePayload,
    /** La société de l'espace courant, résolue par le guard ; `null` = espace personnel. */
    readonly companyId: string | null,
    /** La personne connectée. */
    readonly buyerUserId: string,
  ) {}
}

/**
 * Même arithmétique que le devis anonyme ({@link ShopCartQuoting}), et le gain
 * calculé par la fidélité sur l'assiette que ce décompte vient de produire.
 *
 * Un espace société ne gagne rien ici : la fidélité des pros n'est pas ouverte
 * (lot F), et la question n'est même pas posée.
 */
@QueryHandler(QuoteMyShopCartQuery)
export class QuoteMyShopCartHandler implements IQueryHandler<
  QuoteMyShopCartQuery,
  MyShopQuoteView
> {
  constructor(
    private readonly quoting: ShopCartQuoting,
    private readonly earning: LoyaltyEarningPreview,
  ) {}

  async execute(query: QuoteMyShopCartQuery): Promise<MyShopQuoteView> {
    const { view, voucherTotalEffectCents } = await this.quoting.quote(query);
    const loyaltyPointsToEarn =
      query.companyId === null
        ? await this.earning.pointsToEarn({
            buyerUserId: query.buyerUserId,
            subtotalCents: view.subtotalHtCents,
            discountCents: view.discountCents,
            voucherDiscountCents: view.voucherDiscountCents,
          })
        : null;
    return { ...view, loyaltyPointsToEarn, voucherTotalEffectCents };
  }
}

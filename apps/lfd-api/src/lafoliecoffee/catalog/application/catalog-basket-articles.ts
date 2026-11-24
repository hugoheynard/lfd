import { Injectable } from "@nestjs/common";

import {
  BasketArticles,
  type BasketArticlesReview,
} from "../../../recurring/channels/commerce/index.js";
import { ArticleSaleUnits } from "./article-sale-units.service.js";
import { ReservedArticleGuard } from "./reserved-article-guard.service.js";
import { SaleOperations } from "./sale-operations.service.js";

/**
 * **Ce que les paniers récurrents demandent du catalogue** — le port qu'ils
 * déclarent, implémenté par le catalogue avec ses propres règles : l'unité de
 * vente, les opérations datées (D6), et le mur des articles réservés
 * (`plan-articles-sur-mesure.md`, § 6).
 */
@Injectable()
export class CatalogBasketArticles extends BasketArticles {
  constructor(
    private readonly saleUnits: ArticleSaleUnits,
    private readonly operations: SaleOperations,
    private readonly reserved: ReservedArticleGuard,
  ) {
    super();
  }

  async review(skus: readonly string[]): Promise<BasketArticlesReview> {
    const [weightSold, operationOnly] = await Promise.all([
      this.saleUnits.weightSoldAmong(skus),
      this.operations.operationOnlyAmong(skus),
    ]);
    return { weightSold, operationOnly };
  }

  /** @throws {ReservedArticleRefusedError} un article réservé à un autre compte. */
  ensureOpenTo(companyId: string | null, skus: readonly string[]): Promise<void> {
    return this.reserved.ensureOpenTo(companyId, skus);
  }
}

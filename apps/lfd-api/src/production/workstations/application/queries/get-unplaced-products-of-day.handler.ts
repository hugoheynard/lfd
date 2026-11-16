import type { UnplacedProductsOfDayView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import {
  ExpectedProductionReader,
  ExpectedResuppliesReader,
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../channels/commerce/index.js";
import {
  KnownArticles,
  ProductionDayStatusReader,
  ServiceDay,
  ServiceRange,
} from "../../../day/index.js";
import {
  ProductionDisplaySettings,
  ProductionDisplaySettingsReader,
} from "../../../shared/print/index.js";
import { WorkstationOfProducts } from "../../domain/ports/workstation-of-products.js";
import { type DayArticle, unplacedProductsOf } from "../services/unplaced-products.js";
import { GetUnplacedProductsOfDayQuery } from "./get-unplaced-products-of-day.query.js";

/**
 * **L'alerte du Prod manager** (plan `fournil/plan-postes-du-fournil.md`,
 * § 3.10) : les produits du jour qui n'ont pas de poste.
 *
 * - **Avant l'arrêt**, la demande attendue du seul jour : commandes
 *   (`ExpectedProductionReader`) et réassorts « pour demain »
 *   (`ExpectedResuppliesReader`).
 * - **Après l'arrêt**, les lignes arrêtées du jour (`KnownArticles` borné au
 *   jour) : c'est ce que la fiche et le dossier rangent. La demande attendue
 *   ne rend plus, pour une journée arrêtée, que les commandes `placed`
 *   arrivées après l'arrêt (`planWhere` du commerce, lu le 2026-11-16), que la
 *   fiche ne range pas : elle les annonce en écart, jusqu'au retirage.
 *
 * Les SKU sont ramenés au produit par le commerce (`ProductionArticlesReader`),
 * sans les filtres de vente. Le mode du réglage est servi : l'écran ne montre
 * l'alerte qu'en mode prod. Toute panne remonte : une alerte qui dirait
 * « rien à ranger » faute d'avoir lu mentirait. Il n'écrit rien — §4.
 */
@QueryHandler(GetUnplacedProductsOfDayQuery)
export class GetUnplacedProductsOfDayHandler implements IQueryHandler<
  GetUnplacedProductsOfDayQuery,
  UnplacedProductsOfDayView
> {
  constructor(
    private readonly status: ProductionDayStatusReader,
    private readonly known: KnownArticles,
    private readonly expectedOrders: ExpectedProductionReader,
    private readonly expectedResupplies: ExpectedResuppliesReader,
    private readonly articles: ProductionArticlesReader,
    private readonly workstations: WorkstationOfProducts,
    private readonly display: ProductionDisplaySettingsReader,
  ) {}

  async execute(query: GetUnplacedProductsOfDayQuery): Promise<UnplacedProductsOfDayView> {
    const day = ServiceDay.of(query.serviceDay);
    const [closed, settings] = await Promise.all([
      this.status.isClosed(day),
      this.display.current(),
    ]);
    const dayArticles = await this.articlesOfDay(day, closed);
    const skus = [...new Set(dayArticles.map((article) => article.sku))];
    const articles: ReadonlyMap<string, ProductionArticle> =
      skus.length === 0 ? new Map() : await this.articles.articlesOf(skus);
    const productSkus = [...new Set([...articles.values()].map((item) => item.productSku))];
    const placement = await this.workstations.workstationsOf(productSkus);
    return {
      date: day.value,
      mode: (settings ?? ProductionDisplaySettings.defaults()).grouping,
      closed,
      ...unplacedProductsOf(dayArticles, articles, placement),
    };
  }

  private async articlesOfDay(day: ServiceDay, closed: boolean): Promise<readonly DayArticle[]> {
    const range = ServiceRange.of(day.value, day.value);
    if (closed) {
      return this.known.between(range);
    }
    const [orders, resupplies] = await Promise.all([
      this.expectedOrders.expectedBetween(range),
      this.expectedResupplies.expectedBetween(range),
    ]);
    return [...orders, ...resupplies]
      .filter((entry) => entry.day === day.value)
      .flatMap((entry) => entry.items.map(({ sku, productName }) => ({ sku, productName })));
  }
}

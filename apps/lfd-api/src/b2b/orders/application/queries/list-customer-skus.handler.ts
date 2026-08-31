import type { CustomerSkuStat } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerSkuReader } from "../../domain/ports/customer-sku.reader.js";
import { ProductCatalogReader } from "../../domain/ports/product-catalog.reader.js";
import { ListCustomerSkusQuery } from "./list-customer-skus.query.js";

/**
 * Les habitudes d'achat d'une société, **rejointes au catalogue**.
 *
 * C'est ici que se joue la seule décision du handler : le nom et le prix
 * viennent du **catalogue d'aujourd'hui**, pas du snapshot de la commande. Un
 * commercial qui lit cette liste au téléphone annonce donc le tarif que le
 * serveur appliquera — et non celui d'il y a huit mois.
 *
 * Le SKU disparu du catalogue n'est pas filtré : il descend avec son dernier nom
 * facturé et `stillAvailable: false`. Le retirer laisserait croire que le client
 * ne l'a jamais pris, et le commercial le proposerait à nouveau.
 */
@QueryHandler(ListCustomerSkusQuery)
export class ListCustomerSkusHandler implements IQueryHandler<
  ListCustomerSkusQuery,
  readonly CustomerSkuStat[]
> {
  constructor(
    private readonly habits: CustomerSkuReader,
    private readonly catalog: ProductCatalogReader,
  ) {}

  async execute(query: ListCustomerSkusQuery): Promise<readonly CustomerSkuStat[]> {
    const tallies = await this.habits.byCompany(query.companyId);
    // Résolus EN UN LOT : une liste d'habitudes compte des dizaines d'articles,
    // et depuis que le catalogue vient de la base, un par un serait une requête
    // par ligne.
    const items = await this.catalog.resolveMany(tallies.map((tally) => tally.sku));
    return tallies.map((tally) => {
      const item = items.get(tally.sku) ?? null;
      return {
        sku: tally.sku,
        productName: item?.name ?? tally.lastProductName,
        unitPriceMillicents: item?.unitPriceMillicents ?? 0,
        orderCount: tally.orderCount,
        totalQuantity: tally.totalQuantity,
        totalCents: tally.totalCents,
        lastOrderedAt: tally.lastOrderedAt.toISOString(),
        stillAvailable: item !== null,
      };
    });
  }
}

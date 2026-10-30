import type { CustomerSkuStat } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { CustomerSkuReader } from "../../domain/ports/customer-sku.reader.js";
import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { SaleReferenceSuccessionReader } from "../../../catalog/domain/ports/sale-reference-succession.reader.js";
import { regroupByLineage } from "../../domain/services/customer-sku-lineage.js";
import { ListCustomerSkusQuery } from "./list-customer-skus.query.js";
import { CatalogViewers } from "../../../catalog/application/catalog-viewers.service.js";

/**
 * Les habitudes d'achat d'une société, **rejointes au catalogue**.
 *
 * C'est ici que se joue la seule décision du handler : le nom et le prix
 * viennent du **catalogue d'aujourd'hui**, pas du snapshot de la commande. Un
 * commercial qui lit cette liste au téléphone annonce donc le tarif que le
 * serveur appliquera — et non celui d'il y a huit mois.
 *
 * Une déclinaison détachée ne fait qu'une ligne, sous sa référence la plus
 * récente (L7d-bis de `plan-pro-voit-les-declinaisons.md`) : le client a pris
 * le même article, sous deux références.
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
    private readonly lineage: SaleReferenceSuccessionReader,
    private readonly viewers: CatalogViewers,
  ) {}

  async execute(query: ListCustomerSkusQuery): Promise<readonly CustomerSkuStat[]> {
    const counted = await this.habits.byCompany(query.companyId);
    const tallies = regroupByLineage(
      counted,
      await this.lineage.latestOf(counted.map((tally) => tally.sku)),
    );
    // Résolus EN UN LOT : une liste d'habitudes compte des dizaines d'articles,
    // et depuis que le catalogue vient de la base, un par un serait une requête
    // par ligne.
    //
    // Au lecteur de CE client (`plan-articles-sur-mesure.md`, S7) : ce qu'il
    // peut commander, et, verrouillé, ce qui est réservé à un autre compte.
    const items = await this.catalog.resolveMany(
      tallies.map((tally) => tally.sku),
      await this.viewers.forCompany(query.companyId, "served_and_locked"),
    );
    return tallies.map((tally) => {
      const item = items.get(tally.sku) ?? null;
      const locked = item?.reservation === "other";
      return {
        sku: tally.sku,
        productName: item?.name ?? tally.lastProductName,
        unitPriceMillicents: item?.unitPriceMillicents ?? 0,
        orderCount: tally.orderCount,
        totalQuantity: tally.totalQuantity,
        totalCents: tally.totalCents,
        lastOrderedAt: tally.lastOrderedAt.toISOString(),
        stillAvailable: item !== null && !locked,
        ...(locked ? { lockedReason: "reserved_to_other_account" as const } : {}),
      };
    });
  }
}

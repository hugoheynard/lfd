import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  type ExpectedDayPlanned,
  ExpectedPlannedReader,
  type ExpectedItem,
  type ServiceRange,
} from "../../../production/channels/commerce/index.js";
import {
  type PlannedQuantity,
  PlannedQuantitiesReader,
} from "../../../recurring/channels/commerce/index.js";
import { saleUnitOf } from "./catalog-sale-unit.js";
import type { CatalogSaleUnit } from "../domain/entities/catalog-item.js";

interface PlannedArticle {
  readonly productName: string;
  readonly saleUnit: CatalogSaleUnit;
}

/**
 * **La couche « planifié, non commandé » du prévisionnel**, faite par le
 * commerce : les quantités des brouillons, lues au bloc des paniers par son
 * canal (`PlannedQuantitiesReader`), nommées et mises dans leur unité par le
 * miroir du catalogue. Un brouillon n'a pas de nom figé — il n'est pas
 * vendu — donc le nom est celui d'aujourd'hui.
 *
 * Un article que le miroir ne connaît plus garde son SKU pour nom et se lit
 * à la pièce : le planificateur ne pose que des articles du catalogue, et
 * le fournil doit voir le brouillon plutôt que le perdre.
 *
 * Deux requêtes, chacune par lot : l'agrégat des brouillons, puis les
 * articles qu'il cite.
 */
@Injectable()
export class ProductionPlannedQuantities extends ExpectedPlannedReader {
  constructor(
    private readonly planned: PlannedQuantitiesReader,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async plannedBetween(range: ServiceRange): Promise<readonly ExpectedDayPlanned[]> {
    const quantities = await this.planned.draftBetween(range.from.value, range.to.value);
    if (quantities.length === 0) {
      return [];
    }
    const articles = await this.articlesOf([...new Set(quantities.map((entry) => entry.sku))]);
    const byDay = new Map<string, ExpectedItem[]>();
    for (const entry of quantities) {
      const items = byDay.get(entry.day) ?? [];
      items.push(itemOf(entry, articles.get(entry.sku)));
      byDay.set(entry.day, items);
    }
    return [...byDay.entries()].map(([day, items]) => ({ day, items }));
  }

  private async articlesOf(skus: readonly string[]): Promise<ReadonlyMap<string, PlannedArticle>> {
    // withdrawn-filter: exempt — un brouillon posé avant un retrait se montre encore au fournil.
    const rows = await this.prisma.catalogItem.findMany({
      where: { sku: { in: [...skus] } },
      select: { sku: true, name: true, saleUnit: true },
    });
    return new Map(
      rows.map((row) => [
        row.sku,
        { productName: row.name, saleUnit: saleUnitOf(row.sku, row.saleUnit) },
      ]),
    );
  }
}

function itemOf(entry: PlannedQuantity, article: PlannedArticle | undefined): ExpectedItem {
  return {
    sku: entry.sku,
    productName: article?.productName ?? entry.sku,
    quantity: entry.quantity,
    saleUnit: article?.saleUnit ?? "piece",
  };
}

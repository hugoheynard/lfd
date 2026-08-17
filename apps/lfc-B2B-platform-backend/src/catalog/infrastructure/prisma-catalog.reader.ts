import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { CatalogReader, type ResolvedCatalogItem } from "../domain/catalog.repository.js";

/** La forme que Prisma rend, article + famille + décision locale éventuelle. */
interface ItemRow {
  readonly sku: string;
  readonly productSku: string;
  readonly name: string;
  readonly priceCents: number;
  readonly isDefault: boolean;
  readonly position: number;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly position: number;
    readonly vatRatePercent: { toNumber: () => number };
  };
  readonly override: {
    readonly priceCents: number | null;
    readonly isHidden: boolean;
    readonly isFeatured: boolean;
  } | null;
}

/**
 * Compose le reçu et le décidé — **une seule fois, ici**.
 *
 * Laisser cette composition fuir vers les appelants donnerait autant de versions
 * de « quel prix s'applique » qu'il y a d'écrans, et la première divergence
 * serait un client qui voit un prix que le checkout refuse.
 */
@Injectable()
export class PrismaCatalogReader extends CatalogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findSku(sku: string): Promise<ResolvedCatalogItem | null> {
    const row = await this.prisma.catalogItem.findUnique({
      where: { sku },
      include: { category: true, override: true },
    });
    if (row === null || row.override?.isHidden === true) {
      return null;
    }
    return resolve(row);
  }

  async listSellable(): Promise<ResolvedCatalogItem[]> {
    const rows = await this.prisma.catalogItem.findMany({
      where: { OR: [{ override: null }, { override: { isHidden: false } }] },
      include: { category: true, override: true },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }],
    });
    return rows.map(resolve);
  }
}

/**
 * La règle de résolution, en une ligne : **la décision locale gagne quand elle
 * existe**, sinon c'est le prix du PIM.
 *
 * Les deux sont rendus. Un écran qui ne verrait que le prix final ne pourrait
 * pas dire « prix PIM 2,40 € · prix B2B 2,10 € », et un prix sans provenance ne
 * se défend pas devant un client qui le conteste.
 */
function resolve(row: ItemRow): ResolvedCatalogItem {
  const localPrice = row.override?.priceCents ?? null;
  return {
    sku: row.sku,
    productSku: row.productSku,
    name: row.name,
    unitPriceCents: localPrice ?? row.priceCents,
    pimPriceCents: row.priceCents,
    vatRate: row.category.vatRatePercent.toNumber(),
    categoryId: row.category.id,
    categoryName: row.category.name,
    isDefault: row.isDefault,
    isFeatured: row.override?.isFeatured ?? false,
  };
}

import { categoryPathOf } from "@lfd/catalog-sync";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleSkuAliasReader } from "../domain/ports/sale-sku-alias.reader.js";
import {
  type OrderLineClassification,
  OrderLineClassificationReader,
} from "../../orders/domain/ports/order-line-classification.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";
import { soldUnderShopSkus } from "./shop-sku-filter.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * **Le rangement des SKU de commande, lu sur le catalogue servi** (V4 du plan
 * `documentation/livraisons/clientele/plan-remise-retrait-par-clientele-et-exclusions.md`).
 *
 * Sur `catalog_items` et non `catalog_entries` : c'est la table que la caisse
 * résout déjà, et la seule dont la famille porte une clé étrangère. Le SKU de
 * commande est le SKU de VENTE (`shopSkuOf`, `plan-declinaisons-en-vignette.md`) :
 * celui du produit pour le défaut, le sien pour une déclinaison montrée en
 * vignette — la même règle qu'à la résolution du prix (`CatalogBackedProductCatalog`). Un article retiré
 * n'est pas rangé (`STILL_SOLD`) : la caisse l'a déjà refusé, et le devis ne
 * le chiffre pas.
 *
 * La lignée ne coûte une lecture de plus que si une famille lue a une parente
 * — la même économie que `PrismaCatalogReader.lineage`.
 *
 * Une ancienne référence (`PAI-001`) se range comme sa cible : la remise de
 * retrait se RECALCULE sur les commandes ouvertes, qui la portent encore
 * après la bascule (`plan-defaut-sous-sa-reference.md`, § 10, D-d). La clé
 * rendue reste la référence demandée — c'est elle que la ligne porte.
 */
@Injectable()
export class PrismaOrderLineClassificationReader extends OrderLineClassificationReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasReader: SaleSkuAliasReader,
  ) {
    super();
  }

  async classify(skus: readonly string[]): Promise<ReadonlyMap<string, OrderLineClassification>> {
    if (skus.length === 0) {
      return new Map();
    }
    const aliases = await this.aliasReader.around(skus);
    const canonicals = [...new Set(skus.map((sku) => aliases.canonical(sku)))];
    const rows = await this.prisma.catalogItem.findMany({
      where: { ...soldUnderShopSkus(canonicals), ...STILL_SOLD },
      select: {
        sku: true,
        productSku: true,
        productId: true,
        categoryId: true,
        isDefault: true,
        category: { select: { parentId: true } },
      },
      orderBy: [{ sku: "asc" }],
    });
    const lineage = await this.lineage(rows.some((row) => row.category.parentId !== null));
    const byShopSku = new Map<string, OrderLineClassification>();
    for (const row of rows) {
      byShopSku.set(shopSkuOf(row), {
        productId: row.productId,
        categoryId: row.categoryId,
        categoryPath: lineage(row.categoryId),
      });
    }
    return new Map(
      skus.flatMap((sku) => {
        const found = byShopSku.get(aliases.canonical(sku));
        return found === undefined ? [] : [[sku, found] as const];
      }),
    );
  }

  private async lineage(nested: boolean): Promise<(familyId: string) => readonly string[]> {
    if (!nested) {
      return (familyId) => [familyId];
    }
    const nodes = await this.prisma.catalogCategory.findMany({
      select: { id: true, parentId: true },
    });
    return (familyId) => categoryPathOf(nodes, familyId);
  }
}

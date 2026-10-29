import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { WithdrawnShopSkusReader } from "../domain/ports/withdrawn-shop-skus.reader.js";
import { shopSkuOf } from "../domain/shop-sku.js";

/**
 * Les articles retirés du miroir, par SKU de vente.
 *
 * Le SKU de vente d'un défaut est celui de son produit, celui d'une autre
 * déclinaison est le sien (`shopSkuOf`) ; la clause cherche les deux, puis la
 * clé se recalcule par `shopSkuOf` — le seul point qui décide de cette clé.
 * `variantsAsTiles` n'est PAS exigé, contrairement à `soldUnderShopSkus` : une
 * déclinaison retirée a pu perdre sa vignette avec sa fiche, elle reste
 * « retirée » et non « inconnue » pour qui l'a vendue.
 */
@Injectable()
export class PrismaWithdrawnShopSkusReader extends WithdrawnShopSkusReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async withdrawnAmong(shopSkus: readonly string[]): Promise<ReadonlySet<string>> {
    if (shopSkus.length === 0) {
      return new Set();
    }
    const wanted = [...shopSkus];
    // withdrawn-filter: exempt — on cherche les articles RETIRÉS, pour nommer le
    // refus d'une décision tarifaire (L5 du plan « le pro voit les déclinaisons »).
    const rows = await this.prisma.catalogItem.findMany({
      where: {
        withdrawnAt: { not: null },
        OR: [
          { productSku: { in: wanted }, isDefault: true },
          { sku: { in: wanted }, isDefault: false },
        ],
      },
      select: { sku: true, productSku: true, isDefault: true },
    });
    const asked = new Set(wanted);
    return new Set(rows.map(shopSkuOf).filter((sku) => asked.has(sku)));
  }
}

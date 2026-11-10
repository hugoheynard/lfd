import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { WithdrawnShopSkusReader } from "../domain/ports/withdrawn-shop-skus.reader.js";

/**
 * Les articles retirés du miroir, par SKU de vente.
 *
 * Toute déclinaison se vend sous sa référence (`shopSkuOf`, depuis la bascule
 * du 2026-10-29 — `plan-defaut-sous-sa-reference.md`, L3) : la clause cherche
 * `sku IN …`, sa jumelle en requête. La branche « référence produit et
 * défaut » est tombée avec la bascule.
 *
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
    // withdrawn-filter: exempt — on cherche les articles RETIRÉS, pour nommer le
    // refus d'une décision tarifaire (L5 du plan « le pro voit les déclinaisons »).
    const rows = await this.prisma.catalogItem.findMany({
      where: { withdrawnAt: { not: null }, sku: { in: [...new Set(shopSkus)] } },
      select: { sku: true },
    });
    return new Set(rows.map((row) => row.sku));
  }
}
